# 🚀 Quick Deployment Guide to Render

Follow these steps to deploy your hazard reporting server to Render:

## Step 1: Prepare Your Code

1. **Navigate to the server directory:**
```bash
cd "d:\Bus driver GPS\bus-hazard-server"
```

2. **Install dependencies locally (test):**
```bash
npm install
```

3. **Test locally (optional):**
```bash
# You need PostgreSQL installed locally
npm run dev
```

## Step 2: Push to GitHub

1. **Create a new GitHub repository:**
   - Go to https://github.com/new
   - Name: `bus-hazard-server`
   - Description: "Backend API for Bus Driver GPS hazard reporting"
   - Public or Private (your choice)
   - Click "Create repository"

2. **Initialize git and push:**
```bash
cd "d:\Bus driver GPS\bus-hazard-server"
git init
git add .
git commit -m "Initial commit - Bus Hazard Reporting API"
git remote add origin https://github.com/YOUR_USERNAME/bus-hazard-server.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy on Render (Automatic with Blueprint)

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Sign up/Login with GitHub

2. **Create New Blueprint:**
   - Click "New +" → "Blueprint"
   - Click "Connect GitHub" (authorize if needed)
   - Select your `bus-hazard-server` repository
   - Render will detect the `render.yaml` file
   - Review the services:
     - ✅ Web Service: `bus-hazard-api`
     - ✅ PostgreSQL Database: `bus-hazards-db`
   - Click "Apply"

3. **Wait for deployment:**
   - Database: ~2-3 minutes
   - API: ~3-5 minutes
   - Watch the build logs

4. **Get your API URL:**
   - After deployment, you'll see: `https://bus-hazard-api.onrender.com`
   - Copy this URL!

## Step 4: Update Mobile App

1. **Open `App.tsx` in VS Code**

2. **Update the API URL (line ~41):**
```typescript
// Before:
const HAZARD_API_URL = 'http://localhost:3000';

// After:
const HAZARD_API_URL = 'https://bus-hazard-api.onrender.com';
```

3. **Save the file**

4. **Test in Expo:**
```bash
cd "d:\Bus driver GPS\bus-driver-mobile"
npx expo start
```

5. **Try reporting a hazard!**
   - Start navigation
   - Click "Report" button
   - Select a hazard type
   - Check if it appears on the map

## Step 5: Verify Deployment

Test your API endpoints:

1. **Health Check:**
```bash
curl https://bus-hazard-api.onrender.com/health
```

2. **Get Hazards:**
```bash
curl "https://bus-hazard-api.onrender.com/api/hazards?lat=51.5074&lng=-0.1278&radius=50"
```

3. **Report Hazard (test with curl):**
```bash
curl -X POST https://bus-hazard-api.onrender.com/api/hazards \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Police",
    "latitude": 51.5074,
    "longitude": -0.1278,
    "reported_by": "test_user"
  }'
```

## Troubleshooting

### ❌ "Cannot connect to server"
- Check if Render service is running (Dashboard → Services → bus-hazard-api)
- Free tier spins down after 15 minutes of inactivity (first request takes 30-60 seconds)
- Check if DATABASE_URL environment variable is set correctly

### ❌ Database Connection Failed
- Ensure the database is created before the web service
- Check Database URL in environment variables
- Look at the logs: Dashboard → bus-hazard-api → Logs

### ❌ CORS Error in Mobile App
- Server has CORS enabled by default
- Check if you're using HTTPS (not HTTP) for production URL
- Check network logs in Expo

### ⚠️ Cold Starts (Free Tier)
- Render free tier spins down after 15 minutes
- First request after spin-down takes 30-60 seconds
- Solutions:
  1. Upgrade to paid plan ($7/month for starter)
  2. Use external cron service to ping every 14 minutes
  3. Show loading indicator in app during cold starts

## Optional: Keep Server Warm (Free Tier)

Use a free cron service to prevent spin-downs:

1. **UptimeRobot (Free):**
   - Go to https://uptimerobot.com
   - Add Monitor → HTTP(s)
   - URL: `https://bus-hazard-api.onrender.com/health`
   - Monitoring Interval: 5 minutes
   - This keeps your server warm!

2. **Or use Render Cron Jobs** (Paid feature - $1/month)

## Monitoring

**Render Dashboard:**
- Real-time logs: Dashboard → bus-hazard-api → Logs
- Metrics: CPU, Memory, Response times
- Database: Dashboard → bus-hazards-db → Metrics

**API Statistics:**
```bash
curl https://bus-hazard-api.onrender.com/api/stats
```

## Cost Summary

**Free Forever:**
- ✅ Web Service: 750 hours/month (always on if you keep it warm)
- ✅ PostgreSQL: First 90 days FREE
- ✅ SSL Certificate included
- ✅ Automatic deployments

**After 90 Days:**
- PostgreSQL: $7/month (required to keep data)
- Optional: Starter Plan $7/month (no spin-downs)

**Total Cost after 90 days: $7/month** (just database, keep free web service)

## Next Steps

1. ✅ Test hazard reporting in your app
2. ✅ Build production APK with server URL
3. 🔒 Add user authentication (future)
4. 📊 Set up analytics (future)
5. 🔔 Add push notifications (future)

## Support

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
- Server Status: https://status.render.com

**Your API is now live and serving hazard data to all drivers! 🎉**
