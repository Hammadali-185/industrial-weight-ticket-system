const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const serialManager = require('./main/serialManager.cjs')
const googleDriveService = require('./main/googleDriveService.cjs')

// App configuration
const APP_NAME = 'Weight Dashboard'

// Detect app root path dynamically
function getAppRoot() {
  if (app.isPackaged) {
    // For packaged app: use directory where exe is located
    return path.dirname(app.getPath('exe'))
  } else {
    // For development: use current working directory (project root)
    return process.cwd()
  }
}

// Get data directory (weightdata folder inside app root)
function getDataDir() {
  const appRoot = getAppRoot()
  const dataDir = path.join(appRoot, 'weightdata')
  
  // Ensure directory exists
  try {
    fs.mkdirSync(dataDir, { recursive: true })
  } catch (error) {
    console.error('[Storage] Error creating data directory:', error)
  }
  
  return dataDir
}

// Initialize data directory (will be logged when app is ready)
const DATA_DIR = getDataDir()

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Focus existing window if user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

let mainWindow = null

// Create main window
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')
  console.log('[Electron] Preload path:', preloadPath)
  try {
    console.log('[Electron] Preload exists:', fs.existsSync(preloadPath))
  } catch (error) {
    console.error('[Electron] Error checking preload:', error)
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: APP_NAME,
    icon: path.join(__dirname, 'public', 'icon.png'),
    show: true, // Show window immediately
    autoHideMenuBar: false, // Show menu bar
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  })
  
  console.log('[Electron] Window created, showing...')
  
  // Ensure window is visible and on top
  mainWindow.show()
  mainWindow.focus()
  mainWindow.moveTop() // Bring to front
  
  // Log when window is ready
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] Window ready to show')
    mainWindow.show()
    mainWindow.focus()
  })
  
  // Enable F12 to open/close DevTools (for debugging)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools()
      }
    }
  })
  
  // Log when window is shown
  mainWindow.on('show', () => {
    console.log('[Electron] Window shown')
  })

  // Load the app
  // Always try dev server first (if running), then fallback to production build
  const distPath = path.join(__dirname, 'dist', 'index.html')
  const hasBuild = fs.existsSync(distPath)
  
  // Check for dev server first (preferred for development)
  const http = require('http')
  const tryPort = (port, callback) => {
    const req = http.request(`http://localhost:${port}`, (res) => {
      callback(null, port)
    })
    req.on('error', () => {
      callback(new Error('Port not ready'))
    })
    req.setTimeout(1000, () => {
      req.destroy()
      callback(new Error('Timeout'))
    })
    req.end()
  }
  
  const tryLoad = () => {
    // Try dev server ports first (preferred)
    tryPort(5173, (err, port) => {
      if (err) {
        tryPort(5174, (err2, port2) => {
          if (err2) {
            // No dev server found, try production build
            if (hasBuild) {
              console.log('[Electron] Dev server not found, loading from production build')
              mainWindow.loadFile(distPath).catch((error) => {
                console.error('[Electron] Error loading production build:', error)
                // Build might be broken, show error
                mainWindow.loadURL('about:blank')
                mainWindow.webContents.executeJavaScript(`
                  document.body.innerHTML = '<div style="padding: 40px; font-family: Arial; text-align: center;">
                    <h1 style="color: #e74c3c;">⚠️ Build Error</h1>
                    <p>The production build exists but failed to load.</p>
                    <p>Try rebuilding: <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px;">npm run build</code></p>
                    <p>Or run dev mode: <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px;">npm run electron-dev</code></p>
                  </div>'
                `)
              })
            } else {
              // No dev server and no build - show helpful error
              console.error('[Electron] No dev server or production build found')
              mainWindow.loadURL('about:blank')
              mainWindow.webContents.executeJavaScript(`
                document.body.innerHTML = '<div style="padding: 40px; font-family: Arial; text-align: center; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
                  <div style="background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px;">
                    <h1 style="color: #e74c3c; margin-bottom: 20px;">⚠️ Dashboard Not Found</h1>
                    <p style="font-size: 16px; margin: 20px 0; color: #555;">The React app is not running. Choose one option:</p>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: left;">
                      <h3 style="color: #2c3e50; margin-top: 0;">Option 1: Development Mode</h3>
                      <p style="font-size: 14px; color: #555; margin: 10px 0;">Run this command in terminal:</p>
                      <code style="background: #2c3e50; color: white; padding: 10px 15px; border-radius: 5px; display: block; font-size: 14px;">npm run electron-dev</code>
                      <p style="font-size: 12px; color: #999; margin-top: 10px;">This will start both Vite dev server and Electron.</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: left;">
                      <h3 style="color: #2c3e50; margin-top: 0;">Option 2: Production Build</h3>
                      <p style="font-size: 14px; color: #555; margin: 10px 0;">First build the app:</p>
                      <code style="background: #2c3e50; color: white; padding: 10px 15px; border-radius: 5px; display: block; font-size: 14px;">npm run build</code>
                      <p style="font-size: 12px; color: #555; margin: 10px 0;">Then run:</p>
                      <code style="background: #2c3e50; color: white; padding: 10px 15px; border-radius: 5px; display: block; font-size: 14px;">npm run electron</code>
                    </div>
                  </div>
                </div>'
              `)
            }
          } else {
            console.log(`[Electron] Loading from dev server port ${port2}`)
            mainWindow.loadURL(`http://localhost:${port2}`)
            mainWindow.webContents.openDevTools()
          }
        })
      } else {
        console.log(`[Electron] Loading from dev server port ${port}`)
        mainWindow.loadURL(`http://localhost:${port}`)
        mainWindow.webContents.openDevTools()
      }
    })
  }
  
  // Try loading after a short delay
  setTimeout(tryLoad, 500)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers

// Request reconnect (from UI button)
ipcMain.handle('request-reconnect', async () => {
  await serialManager.requestReconnect()
  return { success: true }
})

// Read history from file (handles both JSON lines and JSON array)
ipcMain.handle('read-history', () => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const HISTORY_FILE = path.join(dataDir, 'history.json')
  
  try {
    console.log(`[Storage] Reading history from: ${HISTORY_FILE}`)
    
    if (!fs.existsSync(HISTORY_FILE)) {
      console.log(`[Storage] History file does not exist, returning empty array`)
      return []
    }
    
    const data = fs.readFileSync(HISTORY_FILE, 'utf8').trim()
    if (!data) {
      console.log(`[Storage] History file is empty, returning empty array`)
      return []
    }
    
    console.log(`[Storage] History file size: ${data.length} bytes`)
    
    // First, try to extract and parse the JSON array part (if file starts with [)
    if (data.trim().startsWith('[')) {
      try {
        // Find the closing bracket of the JSON array
        // We need to find the matching ] that closes the opening [
        let bracketCount = 0
        let inString = false
        let escapeNext = false
        let arrayEndIndex = -1
        
        for (let i = 0; i < data.length; i++) {
          const char = data[i]
          
          if (escapeNext) {
            escapeNext = false
            continue
          }
          
          if (char === '\\') {
            escapeNext = true
            continue
          }
          
          if (char === '"') {
            inString = !inString
            continue
          }
          
          if (!inString) {
            if (char === '[') {
              bracketCount++
            } else if (char === ']') {
              bracketCount--
              if (bracketCount === 0) {
                arrayEndIndex = i
                break
              }
            }
          }
        }
        
        // If we found the closing bracket, extract and parse the array
        if (arrayEndIndex > 0) {
          const arrayPart = data.substring(0, arrayEndIndex + 1)
          console.log(`[Storage] Extracted JSON array part (${arrayPart.length} bytes)`)
          
          try {
            const parsed = JSON.parse(arrayPart)
            if (Array.isArray(parsed)) {
              // Filter out weight readings (items without 'name' field)
              const uiLists = parsed.filter(item => item && item.name)
              const weightReadings = parsed.filter(item => item && !item.name)
              
              if (weightReadings.length > 0) {
                console.log(`[Storage] Found ${weightReadings.length} weight readings mixed with ${uiLists.length} UI lists`)
                console.log(`[Storage] Filtering out weight readings, returning ${uiLists.length} UI lists`)
              }
              
              console.log(`[Storage] ✅ Loaded ${uiLists.length} UI list items from JSON array format`)
              return uiLists
            }
          } catch (parseError) {
            console.log(`[Storage] Failed to parse extracted array part: ${parseError.message}`)
          }
        }
      } catch (extractError) {
        console.log(`[Storage] Error extracting JSON array: ${extractError.message}`)
      }
    }
    
    // Try to parse entire file as JSON array (if it's pure JSON array)
    try {
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        // Filter out weight readings (items without 'name' field)
        const uiLists = parsed.filter(item => item && item.name)
        const weightReadings = parsed.filter(item => item && !item.name)
        
        if (weightReadings.length > 0) {
          console.log(`[Storage] Found ${weightReadings.length} weight readings mixed with ${uiLists.length} UI lists`)
          console.log(`[Storage] Filtering out weight readings, returning ${uiLists.length} UI lists`)
        }
        
        console.log(`[Storage] ✅ Loaded ${uiLists.length} UI list items from JSON array format`)
        return uiLists
      }
    } catch (e) {
      // Not a pure JSON array, try JSON lines (weight readings format)
      console.log('[Storage] Not a pure JSON array, trying JSON lines format...')
    }
    
    // Parse as JSON lines (append-only format for weight readings)
    // BUT: If we have weight readings mixed with UI lists, we need to separate them
    const lines = data.split('\n').filter(line => line.trim())
    const history = lines.map(line => {
      try {
        const parsed = JSON.parse(line)
        // Weight readings have {timestamp, weight} structure
        // UI lists have {id, name, scannedList, etc.} structure
        // Only return UI lists (items with 'name' field)
        if (parsed && parsed.name) {
          return parsed
        }
        // Skip weight readings (they don't have 'name' field)
        return null
      } catch (e) {
        // Skip lines that aren't valid JSON (like the array part)
        return null
      }
    }).filter(item => item !== null)
    
    // If we got items from JSON lines, return them
    if (history.length > 0) {
      console.log(`[Storage] ✅ Loaded ${history.length} UI list items from JSON lines format`)
      return history
    }
    
    // If no valid items found, return empty array
    console.warn('[Storage] ⚠️ No valid UI list items found in history file')
    return []
  } catch (error) {
    console.error('[Storage] ❌ Error reading history:', error)
    console.error('[Storage] Error stack:', error.stack)
    return []
  }
})

// Save history (for UI-generated lists, not weight readings)
ipcMain.handle('save-history', async (_, data) => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const HISTORY_FILE = path.join(dataDir, 'history.json')
  
  try {
    // Validate input
    if (!Array.isArray(data)) {
      console.error('[Storage] save-history: data is not an array:', typeof data)
      console.error('[Storage] save-history: data value:', data)
      return false
    }
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log(`[Storage] Creating data directory: ${dataDir}`)
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    // For UI lists, save as JSON array (different from weight readings)
    // Weight readings are append-only JSON lines, UI lists are full JSON array
    const jsonString = JSON.stringify(data, null, 2)
    
    // Write file with explicit error handling
    try {
      fs.writeFileSync(HISTORY_FILE, jsonString, 'utf8')
      console.log(`[Storage] ✅ File write completed: ${HISTORY_FILE}`)
    } catch (writeError) {
      console.error(`[Storage] ❌ Error writing file: ${writeError.message}`)
      console.error(`[Storage] ❌ Error stack: ${writeError.stack}`)
      throw writeError
    }
    
    // Verify file was written
    if (fs.existsSync(HISTORY_FILE)) {
      const fileSize = fs.statSync(HISTORY_FILE).size
      const fileContent = fs.readFileSync(HISTORY_FILE, 'utf8')
      const parsedContent = JSON.parse(fileContent)
      console.log(`[Storage] ✅ Saved ${data.length} history items to ${HISTORY_FILE} (${fileSize} bytes)`)
      console.log(`[Storage] ✅ Verified: File contains ${parsedContent.length} items`)
      
      // Backup to Google Drive if authenticated
      try {
        googleDriveService.initializeAuth()
        if (googleDriveService.isAuthenticated()) {
          await googleDriveService.uploadHistory(data)
          console.log('[Storage] ✅ History backed up to Google Drive')
        }
      } catch (driveError) {
        console.warn('[Storage] ⚠️ Google Drive backup failed (continuing anyway):', driveError.message)
        // Don't fail the save if Drive backup fails
      }
      
      return true
    } else {
      console.error(`[Storage] ❌ File was not created: ${HISTORY_FILE}`)
      return false
    }
  } catch (error) {
    console.error('[Storage] ❌ Error saving history:', error)
    console.error('[Storage] Error details:', error.message)
    console.error('[Storage] Error stack:', error.stack)
    return false
  }
})

// Read payments from file
ipcMain.handle('read-payments', () => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const PAYMENTS_FILE = path.join(dataDir, 'payments.json')
  
  try {
    if (!fs.existsSync(PAYMENTS_FILE)) {
      return {}
    }
    
    const data = fs.readFileSync(PAYMENTS_FILE, 'utf8').trim()
    if (!data) {
      return {}
    }
    
    const parsed = JSON.parse(data)
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
    
    return {}
  } catch (error) {
    console.error('[Storage] Error reading payments:', error)
    return {}
  }
})

// Save payments to file
ipcMain.handle('save-payments', (_, data) => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const PAYMENTS_FILE = path.join(dataDir, 'payments.json')
  
  try {
    
    // Save payments as JSON object
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2), 'utf8')
    const paymentCount = Object.keys(data).length
    console.log(`[Storage] Saved ${paymentCount} payment(s) to ${PAYMENTS_FILE}`)
    return true
  } catch (error) {
    console.error('[Storage] Error saving payments:', error)
    return false
  }
})

// Save individual list to listings folder
ipcMain.handle('save-list-file', (_, listData) => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const LISTINGS_DIR = path.join(dataDir, 'listings')
  
  try {
    // Ensure listings directory exists
    if (!fs.existsSync(LISTINGS_DIR)) {
      fs.mkdirSync(LISTINGS_DIR, { recursive: true })
    }
    
    // Generate filename with timestamp
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    
    const filename = `list_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`
    const filePath = path.join(LISTINGS_DIR, filename)
    
    // Save list data as JSON
    fs.writeFileSync(filePath, JSON.stringify(listData, null, 2), 'utf8')
    console.log(`[Storage] Saved list file: ${filename}`)
    return true
  } catch (error) {
    console.error('[Storage] Error saving list file:', error)
    return false
  }
})

// Read all listings from listings folder
ipcMain.handle('read-listings', () => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const LISTINGS_DIR = path.join(dataDir, 'listings')
  
  try {
    console.log(`[Storage] Reading listings from: ${LISTINGS_DIR}`)
    
    if (!fs.existsSync(LISTINGS_DIR)) {
      console.log(`[Storage] Listings directory does not exist, returning empty array`)
      return []
    }
    
    const files = fs.readdirSync(LISTINGS_DIR)
    const listingFiles = files.filter(file => file.startsWith('list_') && file.endsWith('.json'))
    
    const listings = listingFiles.map(filename => {
      try {
        const filePath = path.join(LISTINGS_DIR, filename)
        const fileContent = fs.readFileSync(filePath, 'utf8')
        const listData = JSON.parse(fileContent)
        return {
          filename,
          ...listData,
          filePath
        }
      } catch (error) {
        console.error(`[Storage] Error reading listing file ${filename}:`, error)
        return null
      }
    }).filter(item => item !== null)
    
    // Sort by timestamp (newest first)
    listings.sort((a, b) => {
      const timestampA = a.timestamp || a.id || 0
      const timestampB = b.timestamp || b.id || 0
      return timestampB - timestampA
    })
    
    console.log(`[Storage] Loaded ${listings.length} listing files`)
    return listings
  } catch (error) {
    console.error('[Storage] Error reading listings:', error)
    return []
  }
})

// Read log files from logs folder
ipcMain.handle('read-logs', (_, date) => {
  const fs = require('fs-extra')
  const dataDir = getDataDir()
  const LOGS_DIR = path.join(dataDir, 'logs')
  
  try {
    console.log(`[Storage] Reading logs from: ${LOGS_DIR}`)
    
    if (!fs.existsSync(LOGS_DIR)) {
      console.log(`[Storage] Logs directory does not exist, returning empty array`)
      return []
    }
    
    // If date is provided, read specific log file
    if (date) {
      const logFile = path.join(LOGS_DIR, `${date}.log`)
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8')
        const lines = logContent.split('\n').filter(line => line.trim())
        return {
          date,
          filename: `${date}.log`,
          lines,
          content: logContent
        }
      }
      return null
    }
    
    // Otherwise, list all log files
    const files = fs.readdirSync(LOGS_DIR)
    const logFiles = files.filter(file => file.endsWith('.log'))
    
    const logs = logFiles.map(filename => {
      try {
        const filePath = path.join(LOGS_DIR, filename)
        const stats = fs.statSync(filePath)
        const date = filename.replace('.log', '')
        return {
          date,
          filename,
          filePath,
          size: stats.size,
          modified: stats.mtime
        }
      } catch (error) {
        console.error(`[Storage] Error reading log file ${filename}:`, error)
        return null
      }
    }).filter(item => item !== null)
    
    // Sort by date (newest first)
    logs.sort((a, b) => {
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)
      return dateB - dateA
    })
    
    console.log(`[Storage] Found ${logs.length} log files`)
    return logs
  } catch (error) {
    console.error('[Storage] Error reading logs:', error)
    return []
  }
})

// Google Drive IPC Handlers
ipcMain.handle('google-drive-get-auth-url', () => {
  try {
    console.log('[GoogleDrive] Getting auth URL...')
    googleDriveService.initializeAuth()
    const authUrl = googleDriveService.getAuthUrl()
    
    if (!authUrl) {
      throw new Error('Auth URL is empty')
    }
    
    console.log('[GoogleDrive] Auth URL generated, opening browser...')
    
    // Open browser automatically
    const { shell } = require('electron')
    shell.openExternal(authUrl)
    
    return { success: true, authUrl }
  } catch (error) {
    console.error('[GoogleDrive] Error getting auth URL:', error)
    console.error('[GoogleDrive] Error stack:', error.stack)
    return { success: false, error: error.message || 'Unknown error' }
  }
})

ipcMain.handle('google-drive-auth-code', async (_, code) => {
  try {
    const tokens = await googleDriveService.getTokensFromCode(code)
    return { success: true, tokens }
  } catch (error) {
    console.error('[GoogleDrive] Error authenticating:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('google-drive-check-auth', () => {
  try {
    googleDriveService.initializeAuth()
    const isAuth = googleDriveService.isAuthenticated()
    return { success: true, isAuthenticated: isAuth }
  } catch (error) {
    console.error('[GoogleDrive] Error checking auth:', error)
    return { success: false, isAuthenticated: false }
  }
})

ipcMain.handle('google-drive-upload', async (_, historyData) => {
  try {
    googleDriveService.initializeAuth()
    if (!googleDriveService.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' }
    }
    const result = await googleDriveService.uploadHistory(historyData)
    return { success: true, ...result }
  } catch (error) {
    console.error('[GoogleDrive] Error uploading:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('google-drive-download', async () => {
  try {
    googleDriveService.initializeAuth()
    if (!googleDriveService.isAuthenticated()) {
      return { success: false, error: 'Not authenticated', data: null }
    }
    const historyData = await googleDriveService.downloadHistory()
    return { success: true, data: historyData }
  } catch (error) {
    console.error('[GoogleDrive] Error downloading:', error)
    return { success: false, error: error.message, data: null }
  }
})

ipcMain.handle('google-drive-revoke', async () => {
  try {
    const result = await googleDriveService.revokeAccess()
    return { success: result }
  } catch (error) {
    console.error('[GoogleDrive] Error revoking access:', error)
    return { success: false, error: error.message }
  }
})

// App lifecycle
console.log('[Electron] Starting app...')
console.log(`[Storage] Data directory initialized: ${DATA_DIR}`)

app.whenReady().then(() => {
  console.log('[Electron] App ready, initializing...')
  console.log(`[Storage] Using data directory: ${DATA_DIR}`)
  console.log(`[Storage] App is packaged: ${app.isPackaged}`)
  console.log(`[Storage] App root: ${getAppRoot()}`)
  
  // Initialize Google Drive auth
  try {
    googleDriveService.initializeAuth()
    if (googleDriveService.isAuthenticated()) {
      console.log('[GoogleDrive] ✅ Authenticated with Google Drive')
    } else {
      console.log('[GoogleDrive] ℹ️ Not authenticated - user needs to connect')
    }
  } catch (error) {
    console.error('[GoogleDrive] Error initializing:', error)
  }
  
  // Create window
  console.log('[Electron] Creating window...')
  createWindow()
  
  // Initialize serial manager after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    serialManager.startSerialManager(mainWindow)
  })
})

app.on('window-all-closed', () => {
  serialManager.cleanup()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  serialManager.cleanup()
})

