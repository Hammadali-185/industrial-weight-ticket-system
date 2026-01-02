# Google Drive Integration Setup Guide

## ✅ What's Been Implemented

Google Drive integration has been added to your app! Here's what it does:

1. **Automatic Backup**: Every time you save history, it's automatically backed up to Google Drive
2. **Auto-Restore**: If local history is deleted/cleared, the app automatically restores from Google Drive
3. **Manual Restore**: You can manually restore from Google Drive anytime
4. **Clear History Protection**: When you click "Clear History", it only clears local file - Google Drive backup remains safe

## ⚠️ IMPORTANT: Update OAuth Redirect URI

You need to update your OAuth client in Google Cloud Console:

### Steps:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your OAuth 2.0 Client ID: **"Desktop app client"**
3. Find **"Authorized redirect URIs"** section
4. Add this redirect URI:
   ```
   urn:ietf:wg:oauth:2.0:oob
   ```
5. Click **"Save"**

**Why?** This redirect URI is required for desktop apps. It tells Google to show the authorization code on the webpage instead of redirecting (which doesn't work in desktop apps).

## 📦 Install Dependencies

Before running the app, install the new Google APIs package:

```bash
npm install
```

This will install `googleapis` package needed for Google Drive integration.

## 🔗 How to Connect Google Drive

1. Open the app
2. Go to **History** page
3. You'll see a **"Google Drive: Not Connected"** status box
4. Click **"🔗 Connect to Google Drive"** button
5. A browser window will open
6. Sign in with your Google account
7. Click **"Allow"** to grant access
8. You'll see an **authorization code** on the page
9. Copy that code
10. Paste it in the prompt that appears in the app
11. Click **OK**

✅ Done! Your history will now be automatically backed up.

## 📍 Where Data is Stored

- **Local**: `C:\Program Files\Weight Dashboard\weightdata\history.json`
- **Google Drive**: `saqib_silk` folder → `history.json`

## 🔄 How It Works

### When You Save History:
1. Saves to local `history.json` file
2. **Automatically** uploads to Google Drive (if connected)
3. Both locations are updated

### When You Clear History:
1. Clears local `history.json` file (sets to empty array `[]`)
2. **Google Drive backup is NOT deleted** - it remains safe
3. You can restore it anytime using "📥 Restore from Drive" button

### When App Starts:
1. Loads history from local file
2. If local is empty AND Google Drive is connected:
   - Automatically downloads from Google Drive
   - Restores to local file
   - Shows notification

## 🎯 Features

- ✅ **Automatic Backup**: Every save = automatic Drive backup
- ✅ **Auto-Restore**: If local is deleted, auto-restores from Drive
- ✅ **Manual Restore**: "Restore from Drive" button anytime
- ✅ **Clear Protection**: Clear History doesn't delete Drive backup
- ✅ **Status Indicator**: Shows connection status
- ✅ **Easy Disconnect**: Can disconnect anytime

## 🔧 Troubleshooting

### "Not authenticated" error:
- Make sure you've connected Google Drive (click "Connect to Google Drive")
- Check that you completed the OAuth flow and pasted the code

### "Failed to upload" error:
- Check internet connection
- Verify Google Drive folder exists: `saqib_silk`
- Check console (F12) for detailed error

### Authorization code not working:
- Make sure you updated the redirect URI to `urn:ietf:wg:oauth:2.0:oob` in Google Cloud Console
- Copy the entire code (it's usually long)
- Make sure you're signed in with the correct Google account

## 📝 Notes

- The app uses your existing Google Drive storage (no extra cost)
- Data is stored in the `saqib_silk` folder you specified
- Tokens are saved securely in app's userData directory
- You can disconnect anytime - backups remain in Drive


