# Bus Driver GPS - Hazard Reporting Server

Backend API for real-time road hazard reporting (Waze-style) for the Bus Driver GPS mobile app.

## Features

- ✅ Real-time hazard reporting (Road Closure, Police, Accident, Debris, Weather, Other)
- ✅ Geographic filtering (fetch hazards within radius)
- ✅ Auto-expiry (hazards older than 24 hours are automatically cleaned up)
- ✅ Duplicate detection (prevents spam)
- ✅ Rate limiting (100 requests per 15 minutes per IP)
- ✅ CORS enabled for mobile app access
- ✅ PostgreSQL database with geographic indexing
- ✅ Production-ready with Helmet security headers

## API Endpoints

### 1. Health Check
```
GET /
GET /health
```

### 2. Get Hazards
```
GET /api/hazards?lat=51.5074&lng=-0.1278&radius=50
```
**Query Parameters:**
- `lat` (required): Latitude of current location
- `lng` (required): Longitude of current location
- `radius` (optional): Search radius in kilometers (default: 50km)

**Response:**
```json
{
  "count": 12,
  "hazards": [
    {
      "id": 1,
      "type": "Road Closure",
      "latitude": 51.5074,
      "longitude": -0.1278,
      "timestamp": "2026-02-15T00:30:00.000Z",
      "reported_by": "user123",
      "age_minutes": 15
    }
  ],
  "radius_km": 50
}
```

### 3. Report Hazard
```
POST /api/hazards
Content-Type: application/json

{
  "type": "Police",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "reported_by": "user123"
}
```

**Valid Types:**
- Road Closure
- Police
- Accident
- Debris
- Weather
- Other

**Response:**
```json
{
  "message": "Hazard reported successfully",
  "hazard": {
    "id": 1,
    "type": "Police",
    "latitude": 51.5074,
    "longitude": -0.1278,
    "timestamp": "2026-02-15T00:30:00.000Z",
    "reported_by": "user123"
  }
}
```

### 4. Delete Hazard
```
DELETE /api/hazards/:id
```

### 5. Cleanup Old Hazards
```
POST /api/hazards/cleanup
```

### 6. Statistics
```
GET /api/stats
```

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create PostgreSQL database:**
```sql
CREATE DATABASE bus_hazards;
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. **Start development server:**
```bash
npm run dev
```

Server will run on `http://localhost:3000`

## Deploy to Render

### Option 1: Automatic Deployment (Recommended)

1. **Create a GitHub repository:**
```bash
cd bus-hazard-server
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/bus-hazard-server.git
git push -u origin main
```

2. **Deploy on Render:**
   - Go to [https://dashboard.render.com](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Select the `bus-hazard-server` folder
   - Render will automatically detect `render.yaml` and create both the API and database
   - Click "Apply"

3. **Done!** Your API will be available at:
```
https://bus-hazard-api.onrender.com
```

### Option 2: Manual Deployment

1. **Create PostgreSQL Database:**
   - Go to Render Dashboard → New → PostgreSQL
   - Name: `bus-hazards-db`
   - Plan: Free
   - Click "Create Database"
   - Copy the "Internal Database URL"

2. **Create Web Service:**
   - Go to Render Dashboard → New → Web Service
   - Connect your GitHub repository (or use "Public Git repository")
   - Name: `bus-hazard-api`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free

3. **Set Environment Variables:**
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = [Paste Internal Database URL from step 1]

4. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)

## Update Mobile App

After deployment, update your mobile app to use the server:

**In `App.tsx`:**

1. Add server URL at the top:
```typescript
const HAZARD_API_URL = 'https://bus-hazard-api.onrender.com';
```

2. Replace `reportHazard()` function:
```typescript
const reportHazard = async (type: string) => {
  if (!location) {
    Alert.alert('GPS Required', 'Cannot report hazard without GPS location');
    return;
  }

  try {
    const response = await fetch(`${HAZARD_API_URL}/api/hazards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        reported_by: 'mobile_user', // Replace with actual user ID when you add auth
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      setShowReportHazardModal(false);
      Alert.alert('Hazard Reported', `${type} reported successfully!`);
      // Reload hazards
      loadHazards();
    } else {
      Alert.alert('Error', data.error || 'Failed to report hazard');
    }
  } catch (error) {
    Alert.alert('Error', 'Network error. Please try again.');
  }
};
```

3. Replace `loadHazards()` function:
```typescript
const loadHazards = async () => {
  if (!location) return;

  try {
    const response = await fetch(
      `${HAZARD_API_URL}/api/hazards?lat=${location.coords.latitude}&lng=${location.coords.longitude}&radius=50`
    );
    const data = await response.json();
    
    if (response.ok) {
      setHazards(data.hazards);
    }
  } catch (error) {
    console.error('Failed to load hazards:', error);
  }
};
```

4. Poll for updates every 30 seconds:
```typescript
useEffect(() => {
  if (isNavigating) {
    loadHazards();
    const interval = setInterval(loadHazards, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }
}, [isNavigating, location]);
```

## Database Schema

```sql
CREATE TABLE hazards (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reported_by VARCHAR(100) DEFAULT 'anonymous',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hazards_location ON hazards (latitude, longitude);
CREATE INDEX idx_hazards_timestamp ON hazards (timestamp);
```

## Monitoring

- **Health Check:** `https://bus-hazard-api.onrender.com/health`
- **Statistics:** `https://bus-hazard-api.onrender.com/api/stats`
- **Render Dashboard:** Monitor logs, metrics, and uptime

## Cleanup Cron Job

Set up automatic cleanup using Render Cron Jobs (paid feature) or external cron service:

```bash
curl -X POST https://bus-hazard-api.onrender.com/api/hazards/cleanup
```

Run every hour to remove hazards older than 24 hours.

## Free Tier Limitations

Render Free Tier:
- ✅ Automatic SSL
- ✅ 750 hours/month (always on)
- ⚠️ Spins down after 15 minutes of inactivity (cold starts)
- ⚠️ PostgreSQL: 90 days free, then $7/month
- ⚠️ 100 GB bandwidth/month

**Pro Tips:**
- Use external cron service to keep API warm (ping every 14 minutes)
- Consider upgrading database after 90 days ($7/month)
- Implement caching for frequently accessed areas

## Security

- ✅ Helmet.js security headers
- ✅ Rate limiting (100 req/15min)
- ✅ CORS enabled
- ✅ SQL injection protection (parameterized queries)
- ✅ Duplicate detection
- ⚠️ TODO: Add user authentication
- ⚠️ TODO: Add API key authentication

## Future Enhancements

- [ ] User authentication (JWT)
- [ ] Upvote/downvote hazards
- [ ] Report verification system
- [ ] Push notifications for nearby hazards
- [ ] WebSocket for real-time updates
- [ ] Admin dashboard
- [ ] Analytics and heatmaps

## Support

For issues or questions, create an issue in the GitHub repository.

## License

MIT
