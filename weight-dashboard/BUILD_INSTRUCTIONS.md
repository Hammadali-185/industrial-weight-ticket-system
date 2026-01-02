# Windows Installer Build Instructions

## Prerequisites

1. **Node.js** installed (v16 or higher)
2. **npm** installed
3. All dependencies installed: `npm install`

## Step-by-Step Build Process

### 1. Build the React App
First, build the production version of your React app:
```bash
npm run build
```
This creates the `dist/` folder with production files.

### 2. Build the Windows Installer
Run the build command to create the Windows installer:
```bash
npm run build:win
```

Or use the existing command:
```bash
npm run electron-build
```

### 3. Output Location
The installer will be created in:
```
C:\Users\HP\testing\weight-dashboard\dist\
```

The installer file will be named:
```
Weight Dashboard Setup 1.0.0.exe
```

## What Gets Included

The build includes:
- ✅ All files from `dist/` (React app production build)
- ✅ `main.cjs` (Electron main process)
- ✅ `preload.cjs` (Electron preload script)
- ✅ `main/` folder (serialManager.cjs)
- ✅ `package.json` (app metadata)
- ✅ All production dependencies from `node_modules/`
- ❌ Excludes: `src/`, devDependencies, config files, markdown files

## Installing on Another PC

### Files to Include on USB:

1. **The installer .exe file:**
   ```
   Weight Dashboard Setup 1.0.0.exe
   ```
   Location: `C:\Users\HP\testing\weight-dashboard\dist\`

### Installation Steps on Target PC:

1. Copy the installer `.exe` file to the target PC
2. Double-click the installer
3. Follow the installation wizard:
   - Choose installation directory (default: `C:\Program Files\Weight Dashboard\`)
   - Create desktop shortcut (enabled by default)
   - Create Start Menu shortcut (enabled by default)
4. Click "Install"
5. After installation, double-click the desktop shortcut to run the app

## Troubleshooting

### If build fails:
1. Make sure `npm run build` completed successfully first
2. Check that `dist/` folder exists and contains `index.html`
3. Verify all dependencies are installed: `npm install`

### If installer doesn't run:
1. Make sure the target PC is Windows x64 (64-bit)
2. Check Windows Defender isn't blocking the installer
3. Right-click installer → "Run as Administrator" if needed

### If app doesn't start after installation:
1. Check Windows Event Viewer for errors
2. Try running from command line: `cd "C:\Program Files\Weight Dashboard" && Weight Dashboard.exe`
3. Check that all required DLLs are present

## Build Configuration

The build is configured in `package.json` under the `"build"` section:
- **Output**: `dist/` folder
- **Target**: Windows x64 NSIS installer
- **Architecture**: x64 only
- **Installer Type**: NSIS (allows custom installation directory)

## Notes

- The app will create a `weightdata` folder in the installation directory for storing data
- Serial port communication requires proper drivers on the target PC
- The installer is a single `.exe` file (~100-200MB depending on dependencies)





