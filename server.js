require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for mobile app
app.use(express.json());

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Bus Driver GPS - Hazard Reporting API',
    version: '1.0.0'
  });
});

// Database health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
  }
});

// Get all active hazards (within last 24 hours and within geographic bounds)
app.get('/api/hazards', async (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query; // radius in km, default 50km
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Calculate bounding box for efficient query (rough approximation)
    // 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);
    const latDelta = radiusNum / 111;
    const lngDelta = radiusNum / (111 * Math.cos(latNum * Math.PI / 180));

    // Log bounding box and query params
    console.log(`[Hazard GET] lat: ${latNum}, lng: ${lngNum}, radius: ${radiusNum}km, lat range: [${latNum - latDelta}, ${latNum + latDelta}], lng range: [${lngNum - lngDelta}, ${lngNum + lngDelta}]`);

    const query = `
      SELECT 
        id, 
        type, 
        latitude, 
        longitude, 
        timestamp, 
        reported_by,
        EXTRACT(EPOCH FROM (NOW() - timestamp)) / 60 as age_minutes
      FROM hazards 
      WHERE 
        timestamp > NOW() - INTERVAL '24 hours'
        AND latitude BETWEEN $1 AND $2
        AND longitude BETWEEN $3 AND $4
      ORDER BY timestamp DESC
    `;

    const result = await pool.query(query, [
      latNum - latDelta,
      latNum + latDelta,
      lngNum - lngDelta,
      lngNum + lngDelta
    ]);

    console.log(`[Hazard GET] Found ${result.rows.length} hazards in DB.`);

    res.json({
      count: result.rows.length,
      hazards: result.rows,
      radius_km: radius
    });
  } catch (error) {
    console.error('Error fetching hazards:', error);
    res.status(500).json({ error: 'Failed to fetch hazards', message: error.message });
  }
});

// Report a new hazard
app.post('/api/hazards', async (req, res) => {
  try {
    const { type, latitude, longitude, reported_by = 'anonymous' } = req.body;

    // Validation
    if (!type || !latitude || !longitude) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['type', 'latitude', 'longitude'] 
      });
    }

    // Validate hazard type
    const validTypes = ['Road Closure', 'Police', 'Accident', 'Debris', 'Weather', 'Other', 'Traffic'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid hazard type', 
        validTypes 
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Check for duplicate reports (within 100m and same type in last 5 minutes)
    const duplicateCheck = `
      SELECT id FROM hazards 
      WHERE type = $1 
        AND timestamp > NOW() - INTERVAL '5 minutes'
        AND ABS(latitude - $2) < 0.001 
        AND ABS(longitude - $3) < 0.001
    `;
    const duplicateResult = await pool.query(duplicateCheck, [type, latitude, longitude]);

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate report detected', 
        message: 'Similar hazard already reported nearby' 
      });
    }

    // Insert new hazard
    const insertQuery = `
      INSERT INTO hazards (type, latitude, longitude, reported_by, timestamp)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, type, latitude, longitude, timestamp, reported_by
    `;

    const result = await pool.query(insertQuery, [
      type,
      parseFloat(latitude),
      parseFloat(longitude),
      reported_by
    ]);

    // Log hazard insertion
    console.log(`[Hazard POST] Inserted hazard:`, result.rows[0]);

    res.status(201).json({
      message: 'Hazard reported successfully',
      hazard: result.rows[0]
    });
  } catch (error) {
    console.error('Error reporting hazard:', error);
    res.status(500).json({ error: 'Failed to report hazard', message: error.message });
  }
});

// Record a driver's confirmation that a hazard is still present or has cleared.
app.post('/api/hazards/:id/confirm', async (req, res) => {
  try {
    const hazardId = Number.parseInt(req.params.id, 10);
    const { still_exists, confirmed_by = 'anonymous' } = req.body || {};

    if (!Number.isInteger(hazardId) || hazardId <= 0 || typeof still_exists !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid confirmation',
        required: ['numeric hazard id', 'still_exists boolean']
      });
    }

    const hazard = await pool.query('SELECT id FROM hazards WHERE id = $1', [hazardId]);
    if (hazard.rows.length === 0) {
      return res.status(404).json({ error: 'Hazard not found' });
    }

    await pool.query(
      `INSERT INTO hazard_confirmations (hazard_id, still_exists, confirmed_by, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [hazardId, still_exists, String(confirmed_by).slice(0, 100)]
    );

    const counts = await pool.query(
      `SELECT
         COUNT(*)::int AS total_confirmations,
         COUNT(*) FILTER (WHERE still_exists = false)::int AS cleared_confirmations
       FROM hazard_confirmations
       WHERE hazard_id = $1`,
      [hazardId]
    );

    // Do not automatically delete a shared hazard based on an unauthenticated single vote.
    res.json({
      message: 'Hazard confirmation recorded',
      should_delete: false,
      confirmations: counts.rows[0]
    });
  } catch (error) {
    console.error('Error confirming hazard:', error);
    res.status(500).json({ error: 'Failed to confirm hazard' });
  }
});

// Delete a hazard (optional - for moderation or user corrections)
app.delete('/api/hazards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM hazards WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hazard not found' });
    }

    res.json({ message: 'Hazard deleted successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting hazard:', error);
    res.status(500).json({ error: 'Failed to delete hazard', message: error.message });
  }
});

// Cleanup old hazards (called by cron or manually)
app.post('/api/hazards/cleanup', async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM hazards WHERE timestamp < NOW() - INTERVAL '24 hours' RETURNING id"
    );

    res.json({ 
      message: 'Cleanup completed', 
      deleted_count: result.rows.length 
    });
  } catch (error) {
    console.error('Error cleaning up hazards:', error);
    res.status(500).json({ error: 'Failed to cleanup hazards', message: error.message });
  }
});

// Statistics endpoint (optional)
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_hazards,
        COUNT(DISTINCT type) as unique_types,
        type,
        COUNT(*) as count
      FROM hazards 
      WHERE timestamp > NOW() - INTERVAL '24 hours'
      GROUP BY type
    `);

    const totalCount = await pool.query(`
      SELECT COUNT(*) as total FROM hazards 
      WHERE timestamp > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      total_active_hazards: parseInt(totalCount.rows[0].total),
      by_type: stats.rows
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', message: error.message });
  }
});

// === SUBSCRIPTION ENDPOINTS ===

// Get subscription status for a device
app.get('/api/subscription/status', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Check for active subscription first
    const subscriptionQuery = await pool.query(
      `SELECT * FROM subscriptions 
       WHERE device_id = $1 AND is_active = true AND end_date > NOW()
       ORDER BY end_date DESC LIMIT 1`,
      [deviceId]
    );

    if (subscriptionQuery.rows.length > 0) {
      const sub = subscriptionQuery.rows[0];
      return res.json({
        status: 'active',
        hasAccess: true,
        isTrialPeriod: false,
        subscriptionType: sub.subscription_type,
        endDate: sub.end_date,
        daysRemaining: Math.ceil((new Date(sub.end_date) - new Date()) / (1000 * 60 * 60 * 24))
      });
    }

    // Check for trial period
    const trialQuery = await pool.query(
      'SELECT * FROM device_trials WHERE device_id = $1',
      [deviceId]
    );

    if (trialQuery.rows.length > 0) {
      const trial = trialQuery.rows[0];
      const now = new Date();
      const trialEnd = new Date(trial.trial_end_date);
      const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

      if (now < trialEnd) {
        // Trial still active
        return res.json({
          status: 'trial',
          hasAccess: true,
          isTrialPeriod: true,
          trialStartDate: trial.trial_start_date,
          trialEndDate: trial.trial_end_date,
          daysRemaining: Math.max(0, daysRemaining)
        });
      } else {
        // Trial expired
        return res.json({
          status: 'expired',
          hasAccess: false,
          isTrialPeriod: false,
          daysRemaining: 0
        });
      }
    }

    // No trial or subscription found - eligible for new trial
    return res.json({
      status: 'new',
      hasAccess: false,
      isTrialPeriod: false,
      eligibleForTrial: true
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: 'Failed to check subscription status', message: error.message });
  }
});

// Start a new trial for a device
app.post('/api/subscription/start-trial', async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Check if device already has a trial
    const existingTrial = await pool.query(
      'SELECT * FROM device_trials WHERE device_id = $1',
      [deviceId]
    );

    if (existingTrial.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Trial already used', 
        message: 'This device has already used the free trial' 
      });
    }

    // Create new 7-day trial
    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const result = await pool.query(
      `INSERT INTO device_trials (device_id, trial_start_date, trial_end_date)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [deviceId, trialStartDate, trialEndDate]
    );

    console.log(`[Trial] Started new 7-day trial for device: ${deviceId}`);

    res.status(201).json({
      message: 'Trial started successfully',
      status: 'trial',
      hasAccess: true,
      isTrialPeriod: true,
      trialStartDate: result.rows[0].trial_start_date,
      trialEndDate: result.rows[0].trial_end_date,
      daysRemaining: 7
    });

  } catch (error) {
    console.error('Error starting trial:', error);
    res.status(500).json({ error: 'Failed to start trial', message: error.message });
  }
});

// Verify Google Play purchase and activate subscription
app.post('/api/subscription/verify-purchase', async (req, res) => {
  try {
    const { deviceId, subscriptionType, googlePlayReceipt } = req.body;
    
    if (!deviceId || !subscriptionType || !googlePlayReceipt) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['deviceId', 'subscriptionType', 'googlePlayReceipt']
      });
    }

    // TODO: Add actual Google Play receipt verification here
    // For now, we'll trust the client (NOT production-ready!)
    // In production, use Google Play Developer API to verify the receipt server-side

    const startDate = new Date();
    const endDate = new Date();
    
    // Set expiration based on subscription type
    if (subscriptionType === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (subscriptionType === 'annual') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      return res.status(400).json({ error: 'Invalid subscription type' });
    }

    // Upsert subscription (update if exists, insert if not)
    const result = await pool.query(
      `INSERT INTO subscriptions (device_id, subscription_type, start_date, end_date, google_play_receipt, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (device_id) 
       DO UPDATE SET 
         subscription_type = $2,
         start_date = $3,
         end_date = $4,
         google_play_receipt = $5,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [deviceId, subscriptionType, startDate, endDate, googlePlayReceipt]
    );

    console.log(`[Subscription] Activated ${subscriptionType} subscription for device: ${deviceId}`);

    res.json({
      message: 'Subscription activated successfully',
      status: 'active',
      hasAccess: true,
      subscriptionType: result.rows[0].subscription_type,
      endDate: result.rows[0].end_date
    });

  } catch (error) {
    console.error('Error verifying purchase:', error);
    res.status(500).json({ error: 'Failed to verify purchase', message: error.message });
  }
});

// Initialize database table on startup
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazards (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reported_by VARCHAR(100) DEFAULT 'anonymous',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index for faster geographic queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hazards_location 
      ON hazards (latitude, longitude);
    `);

    // Create index for timestamp queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hazards_timestamp 
      ON hazards (timestamp);
    `);

    // Track hazard confirmations from drivers.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazard_confirmations (
        id SERIAL PRIMARY KEY,
        hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
        still_exists BOOLEAN NOT NULL,
        confirmed_by VARCHAR(100) DEFAULT 'anonymous',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hazard_confirmations_hazard_id
      ON hazard_confirmations (hazard_id);
    `);

    // === SUBSCRIPTION TABLES ===
    // Table to track device trials (prevents unlimited trials by clearing cache)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_trials (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        trial_start_date TIMESTAMP NOT NULL,
        trial_end_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table to track active subscriptions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        subscription_type VARCHAR(20) NOT NULL, -- 'monthly' or 'annual'
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        google_play_receipt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Index for quick device lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_trials_device_id 
      ON device_trials (device_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_device_id 
      ON subscriptions (device_id);
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Bus Hazard Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

startServer();
