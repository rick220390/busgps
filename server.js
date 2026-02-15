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
    const validTypes = ['Road Closure', 'Police', 'Accident', 'Debris', 'Weather', 'Other'];
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

    res.status(201).json({
      message: 'Hazard reported successfully',
      hazard: result.rows[0]
    });
  } catch (error) {
    console.error('Error reporting hazard:', error);
    res.status(500).json({ error: 'Failed to report hazard', message: error.message });
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
