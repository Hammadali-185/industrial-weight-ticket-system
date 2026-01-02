# Quick Start Guide

## ✅ Electron App is Running!

The Vite dev server is running on **http://localhost:5173**. 

### If Electron window is open but blank:

1. **Check if Electron started** - Look for the Electron window. It should show the dashboard automatically.

2. **If Electron didn't start automatically**, open a **new terminal** and run:
   ```bash
   npm run electron
   ```

3. **The Electron window should now load** the dashboard from `http://localhost:5173`

### If you see the dashboard but it's blank:

- The React app is loading but may need a moment to initialize
- Check the browser DevTools (should open automatically) for any errors
- Refresh the window: Press `Ctrl+R` or `F5`

### Current Status:

✅ Vite dev server: Running on port 5173  
✅ Electron: Should start automatically (or run `npm run electron` manually)  
✅ Dashboard: Should load automatically in Electron window

### Next Steps:

Once the dashboard loads, you should see:
- Live Weight page (default)
- Navigation bar with all pages
- Connection status for serial devices

The serial port connection errors in the console are normal if devices aren't connected yet - the app will keep trying to reconnect.







