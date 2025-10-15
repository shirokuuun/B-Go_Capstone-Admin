# Vercel Deployment Guide for B-GO Admin Panel

## What I've Done

I've converted your Express backend server to Vercel serverless functions so user deletion and conductor creation will work on Vercel hosting.

### Files Created/Modified:

1. **`client/api/delete-user.js`** - Serverless function for deleting users
2. **`client/api/create-conductor.js`** - Serverless function for creating conductors
3. **`client/vercel.json`** - Updated with API routes configuration
4. **`client/src/pages/UserManagement/UserManagement.js`** - Updated to use environment-based API URL

## Deployment Steps

### 1. Push Your Code to GitHub

```bash
git add .
git commit -m "feat: add Vercel serverless functions for user deletion and conductor creation"
git push vercel-repo main
```

### 2. Configure Environment Variables in Vercel

Go to your Vercel project dashboard → Settings → Environment Variables and add these:

#### Required Variables:

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `FIREBASE_PROJECT_ID` | `it-capstone-6fe19` | From your `.env` file |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | From your `.env` file (keep the quotes and newlines) |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@...` | From your `.env` file |
| `VITE_FIREBASE_API_KEY` | `AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc` | From your `.env` file |
| `VITE_FIREBASE_AUTH_DOMAIN` | `it-capstone-6fe19.firebaseapp.com` | From your `.env` file |
| `VITE_FIREBASE_PROJECT_ID` | `it-capstone-6fe19` | From your `.env` file |
| `VITE_FIREBASE_STORAGE_BUCKET` | `it-capstone-6fe19.firebasestorage.app` | From your `.env` file |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `183068104612` | From your `.env` file |
| `VITE_FIREBASE_APP_ID` | `1:183068104612:web:26109c8ebb28585e265331` | From your `.env` file |
| `VITE_API_BASE_URL` | Leave empty for production (will use your Vercel domain) | N/A |

**IMPORTANT for `FIREBASE_PRIVATE_KEY`:**
- Copy the entire private key INCLUDING the quotes from your `.env` file
- Make sure newlines (`\n`) are preserved
- Example format: `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

### 3. Redeploy Your Project

After adding environment variables, Vercel will automatically redeploy. Or you can manually trigger a redeploy:

1. Go to Vercel Dashboard
2. Select your project
3. Click "Deployments" tab
4. Click "Redeploy" on the latest deployment

### 4. Test the API Endpoints

Once deployed, your API endpoints will be available at:

- **Delete User:** `https://your-domain.vercel.app/api/users/delete/{userId}`
- **Create Conductor:** `https://your-domain.vercel.app/api/conductors/create`

## How It Works

### Local Development (localhost)
- Backend server runs on `http://localhost:3000`
- Frontend uses `VITE_API_BASE_URL=http://localhost:3000` from `.env`
- Express server handles all API requests

### Production (Vercel)
- API endpoints are Vercel serverless functions in `client/api/` folder
- Frontend uses `window.location.origin` as API base URL
- Routes are configured in `vercel.json` to redirect API calls to serverless functions

## Testing After Deployment

1. **Test User Deletion:**
   - Log in as superadmin
   - Go to User Management
   - Try to delete a user
   - Should work without "ERR_CONNECTION_REFUSED" error

2. **Test Conductor Creation:**
   - Go to Conductor Management
   - Try to create a new conductor
   - Should successfully create the conductor

## Troubleshooting

### If user deletion still doesn't work:

1. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Deployments
   - Click on the latest deployment
   - Check "Functions" tab for error logs

2. **Verify Environment Variables:**
   - Go to Settings → Environment Variables
   - Make sure all Firebase variables are set correctly
   - Pay special attention to `FIREBASE_PRIVATE_KEY` formatting

3. **Check API Response:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Try deleting a user
   - Check the API request/response

### Common Issues:

1. **"Invalid credentials" error:**
   - Check that `FIREBASE_PRIVATE_KEY` has correct formatting with `\n` for newlines
   - Make sure quotes are included: `"-----BEGIN PRIVATE KEY-----\n..."`

2. **"CORS error":**
   - The serverless functions already have CORS headers configured
   - Should work automatically

3. **"Function timeout":**
   - Vercel free tier has 10-second timeout for serverless functions
   - User deletion should complete within this time

## Local Development

To run locally with the backend server:

```bash
cd client
node server/server.js
```

This starts the Express server on port 3000 for local development.

## Notes

- The Express server (`client/server/server.js`) is kept for local development
- Vercel doesn't support Express servers directly, hence the serverless functions
- Both implementations use the same Firebase Admin SDK logic
- Production automatically uses Vercel serverless functions
- Local development uses Express server
