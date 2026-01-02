# Electron Setup Guide

This guide explains how to convert the web app to an Electron desktop application. The storage system is already prepared to automatically use file system storage when running in Electron.

## Current Status

✅ **Storage System Ready**: The app automatically detects Electron and uses file system storage instead of IndexedDB when running as a desktop app.

✅ **Data Persistence**: History data will be stored in:
- **Windows**: `C:\Users\[Username]\AppData\Roaming\weight-dashboard\history.json`
- **macOS**: `~/Library/Application Support/weight-dashboard/history.json`
- **Linux**: `~/.config/weight-dashboard/history.json`

## Installation Steps

### 1. Install Electron Dependencies

```bash
npm install --save-dev electron electron-builder
```

### 2. Update package.json

Add these scripts to your `package.json`:

```json
{
  "main": "electron-main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder",
    "electron:pack": "npm run build && electron-builder --dir"
  }
}
```

### 3. Install Additional Dev Dependencies (Optional)

For better development experience:

```bash
npm install --save-dev concurrently wait-on
```

### 4. Create Electron Configuration

Create `electron-builder.json`:

```json
{
  "appId": "com.saqibsilk.weight-dashboard",
  "productName": "Weight Dashboard",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "electron-main.js",
    "electron-preload.js",
    "package.json"
  ],
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"
  },
  "mac": {
    "target": "dmg",
    "icon": "build/icon.icns"
  },
  "linux": {
    "target": "AppImage",
    "icon": "build/icon.png"
  }
}
```

## How It Works

### Storage Detection

The storage system (`src/utils/storage.js`) automatically:

1. **Detects Electron** by checking for `window.electronAPI` or Electron process
2. **Uses File System** when Electron is detected
3. **Falls back to IndexedDB** when running in a web browser

### Data Migration

When you first run the Electron app:

1. The app checks for existing IndexedDB data
2. Automatically migrates it to file system storage
3. Both storages are kept in sync as backup

### File Location

History data is stored in:
- **File**: `history.json` in the app's user data directory
- **Format**: JSON file with all history entries
- **Backup**: IndexedDB is also updated for redundancy

## Development

### Run in Development Mode

```bash
npm run electron:dev
```

This will:
1. Start the Vite dev server
2. Launch Electron with the app
3. Enable hot reload

### Build for Production

```bash
npm run electron:build
```

This will:
1. Build the React app
2. Package it as an Electron app
3. Create installers (NSIS for Windows, DMG for macOS, AppImage for Linux)

## Testing Storage

To verify file system storage is working:

1. Open the Electron app
2. Create some history entries
3. Check the file location:
   - **Windows**: `%APPDATA%\weight-dashboard\history.json`
   - **macOS**: `~/Library/Application Support/weight-dashboard/history.json`
   - **Linux**: `~/.config/weight-dashboard/history.json`

The file should contain your history data in JSON format.

## Benefits

✅ **Persistent Storage**: Data survives browser data clearing  
✅ **Accessible Files**: You can backup/restore the JSON file manually  
✅ **No Size Limits**: Unlike localStorage, file system has no size restrictions  
✅ **Cross-Platform**: Works on Windows, macOS, and Linux  
✅ **Automatic Fallback**: Still works in web browser using IndexedDB  

## Next Steps

1. Complete your app development
2. Test the storage system in web mode
3. When ready, follow the installation steps above
4. The storage will automatically switch to file system in Electron








