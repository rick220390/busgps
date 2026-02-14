# 🚀 Deploy to Render in 3 Steps

Your code is now on GitHub: https://github.com/rick220390/busgps

## Step 1: Create Render Account

1. Go to https://dashboard.render.com/register
2. Click "GitHub" to sign up with GitHub (easiest)
3. Authorize Render to access your GitHub repositories

## Step 2: Deploy with Blueprint (Automatic)

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Click:** "New +" → "Blueprint"
3. **Connect Repository:** Select `rick220390/busgps`
4. **Review Services:** 
   - ✅ Web Service: `bus-hazard-api` (Node.js server)
   - ✅ PostgreSQL Database: `bus-hazards-db` (Free for 90 days)
5. **Click:** "Apply"
6. **Wait:** 5-7 minutes for deployment

## Step 3: Get Your URL

After deployment completes:

1. Go to **Dashboard → Services → bus-hazard-api**
2. Copy the URL at the top (looks like: `https://bus-hazard-api.onrender.com`)
3. **Save this URL!** You need it for the mobile app

## Update Mobile App

Open `d:\Bus driver GPS\bus-driver-mobile\App.tsx` and change line ~41:

```typescript
// Before:
const HAZARD_API_URL = 'http://localhost:3000';

// After:
const HAZARD_API_URL = 'https://bus-hazard-api.onrender.com';
```

## Test Your API

Once deployed, test these URLs in your browser:

1. **Health Check:**
   ```
   https://bus-hazard-api.onrender.com/health
   ```
   Should show: `{"status":"healthy","database":"connected"}`

2. **API Stats:**
   ```
   https://bus-hazard-api.onrender.com/api/stats
   ```
   Should show hazard statistics (0 at first)

## What Happens Next?

✅ **Automatic SSL** - Your API has HTTPS for free  
✅ **Auto-deploys** - Every git push updates the server  
✅ **Database Backups** - Automatic daily backups  
✅ **Monitoring** - View logs and metrics in dashboard  

## Cost

- **First 90 days:** 100% FREE
- **After 90 days:** $7/month for database only
- **Web service:** Always free (with 15-min spin-down)

## Keep Server Warm (Optional)

Free tier sleeps after 15 minutes. To keep it awake:

1. **UptimeRobot (Free):**
   - Go to https://uptimerobot.com
   - Add Monitor → HTTP(s)
   - URL: `https://bus-hazard-api.onrender.com/health`
   - Interval: 5 minutes
   - ✅ Server stays warm!

## Troubleshooting

### ❌ "Cannot connect to server" in app
- Wait 30-60 seconds (free tier cold start)
- Check if URL in App.tsx is correct (with HTTPS)
- Verify server is running: Dashboard → bus-hazard-api → "Running"

### ❌ Health check fails
- Go to Dashboard → bus-hazards-db
- Check if database is running
- View logs: Dashboard → bus-hazard-api → Logs

### ❌ Build failed
- Check logs in Render dashboard
- Verify package.json has all dependencies
- Make sure Node version is 18+

## Support

- **Render Docs:** https://render.com/docs
- **GitHub Repo:** https://github.com/rick220390/busgps
- **Server Logs:** Dashboard → bus-hazard-api → Logs

---

**You're all set! 🎉 Your Waze-style hazard reporting system is ready to go live!**
