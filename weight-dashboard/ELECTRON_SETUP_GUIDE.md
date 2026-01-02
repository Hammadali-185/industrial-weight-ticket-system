# Electron Desktop App Setup Guide

## 📋 Overview

This guide will help you convert the React web app into a full Electron desktop application for Windows.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- Electron
- SerialPort (for device communication)
- ESC/POS libraries (for thermal printing)
- Electron Builder (for packaging)

### 2. Development Mode

```bash
npm run electron-dev
```

This will:
- Start Vite dev server on `http://localhost:5173`
- Launch Electron window
- Connect to serial devices automatically
- Enable hot-reload for React components

### 3. Build Production EXE

```bash
npm run electron-build
```

This will:
- Build React app for production
- Package Electron app
- Create portable EXE in `dist-electron/` folder

## 📁 File Structure

```
weight-dashboard/
├── main.js                 # Electron main process (serial ports, file storage)
├── preload.js              # Secure IPC bridge
├── electron-builder.yml    # Build configuration
├── package.json            # Dependencies and scripts
├── src/                    # React app (unchanged)
│   ├── pages/             # React pages
│   ├── components/         # React components
│   └── utils/             # Utilities (storage.js updated)
└── dist/                   # Built React app
```

## 🔧 Configuration

### Data Storage Location

All app data is stored in:
```
C:\SaqibSilk_WeightApp\data\
```

Files:
- `history.json` - All history records
- `settings.json` - App settings

### Serial Port Configuration

The app automatically detects and connects to:
1. **Weight Machine** - Tests baud rates: 9600, 19200, 115200, 4800, 38400
2. **QR Scanner** - Tests baud rates: 9600, 115200
3. **Thermal Printer** - Tests baud rates: 9600, 115200

Auto-reconnection happens every 5 seconds if a device disconnects.

## 🔌 Serial Device Setup

### Weight Machine (YH-T7E)
- Connect via USB-to-RS232 adapter
- Data format: `=DDD.DDD` (e.g., `=500.250`)
- Stable weight detected after 5 consecutive identical readings

### QR Scanner
- Connect via USB or serial port
- Sends scanned data as text with line breaks
- Automatically triggers data in React app

### Thermal Printer
- Connect via USB or serial port
- Supports ESC/POS commands
- Falls back to system print dialog if not connected

## 📦 Building the App

### Portable EXE (No Installation)

The build creates a portable EXE that:
- Doesn't require installation
- Can be run from any folder
- Stores data in `C:\SaqibSilk_WeightApp\data\`

### Build Output

After running `npm run electron-build`:
- Location: `dist-electron/Saqib Silk Weight Dashboard-1.0.0-portable.exe`
- Size: ~100-150 MB (includes Electron runtime)
- Can be copied to any Windows machine

## 🧪 Testing Checklist

### Before Building

- [ ] All three devices connected
- [ ] Weight machine shows readings in Live Weight page
- [ ] QR scanner triggers data in Generate List page
- [ ] Printer prints tickets (or system dialog works)
- [ ] History saves to `C:\SaqibSilk_WeightApp\data\history.json`
- [ ] Data persists after closing and reopening app

### After Building

- [ ] Portable EXE runs without errors
- [ ] All devices auto-connect
- [ ] Data persists between sessions
- [ ] Printing works
- [ ] No console errors

## 🐛 Troubleshooting

### Serial Port Issues

**Problem**: Devices not connecting
- Check device manager for COM port numbers
- Ensure devices are powered on
- Try unplugging and replugging USB cables
- Check if ports are in use by other programs

**Solution**: 
- Check console logs in Electron DevTools
- Verify baud rates match device specifications
- Try manually specifying ports in code

### Storage Issues

**Problem**: Data not saving
- Check if `C:\SaqibSilk_WeightApp\data\` folder exists
- Verify write permissions on C: drive
- Check console for storage errors

**Solution**:
- Run app as Administrator if needed
- Check Windows Defender/antivirus isn't blocking file access
- Verify folder permissions

### Printing Issues

**Problem**: Printer not printing
- Check printer connection
- Verify printer supports ESC/POS commands
- Check if printer is in Windows printer list

**Solution**:
- App will fallback to system print dialog
- Use Windows print dialog if ESC/POS fails
- Configure printer settings in Windows

### Build Issues

**Problem**: Build fails
- Check Node.js version (should be 16+)
- Ensure all dependencies installed
- Check for missing icon file

**Solution**:
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Create `public/icon.ico` if missing

## 📝 Development Notes

### IPC Communication

The app uses IPC (Inter-Process Communication) between:
- **Main Process** (`main.js`) - Node.js, handles serial ports and file system
- **Renderer Process** (`src/`) - React app, handles UI

Communication via:
- `ipcMain.handle()` - Main process handlers
- `ipcRenderer.invoke()` - React to main process
- `webContents.send()` - Main to React

### Storage Strategy

1. **Primary**: File system (`C:\SaqibSilk_WeightApp\data\`)
2. **Backup**: localStorage (browser storage)
3. **Fallback**: IndexedDB (if available)

### Single Instance Lock

The app prevents multiple instances using `app.requestSingleInstanceLock()`.
If user tries to open another instance, it focuses the existing window.

## 🔐 Security

- `contextIsolation: true` - Prevents renderer from accessing Node.js directly
- `nodeIntegration: false` - Renderer can't use `require()`
- `preload.js` - Secure bridge for IPC communication
- No remote module - Disabled for security

## 📞 Support

For issues or questions:
1. Check console logs in DevTools (Ctrl+Shift+I)
2. Check `C:\SaqibSilk_WeightApp\data\` for data files
3. Verify device connections in Device Manager
4. Review Electron documentation: https://www.electronjs.org/

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Platform**: Windows 10/11







