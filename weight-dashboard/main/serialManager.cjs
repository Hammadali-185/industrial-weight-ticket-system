const { SerialPort } = require('serialport')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// Serial line (weight scale) — match scale / Web Serial defaults
const BAUD_RATE = 9600
const DATA_BITS = 8
const STOP_BITS = 1
const PARITY = 'none'
/** Handshaking / hardware flow control: none */
const RTSCTS = false
const STABILITY_THRESHOLD = 5 // 5 consecutive identical readings
const RECONNECT_DELAY = 3000 // 3 seconds

/**
 * Prefer real USB–serial adapters (FTDI, CH340, etc.) over virtual COM ports
 * (Intel AMT SOL, Bluetooth) so a single “mystery” scale cable is probed first.
 * Lower number = scanned first.
 */
function portProbePriority(portInfo) {
  const fn = String(portInfo.friendlyName || '').toLowerCase()
  const mfr = String(portInfo.manufacturer || '').toLowerCase()
  const pnp = String(portInfo.pnpId || '').toLowerCase()

  if (mfr.includes('intel') && (fn.includes('management') || fn.includes('amt') || fn.includes('sol'))) {
    return 200
  }
  if (fn.includes('bluetooth') || pnp.includes('bth')) return 180
  if (portInfo.vendorId) return 10
  if (mfr.includes('ftdi')) return 12
  if (mfr.includes('silicon labs') || mfr.includes('silicon laboratories')) return 12
  if (mfr.includes('wch.cn') || mfr.includes('ch340') || fn.includes('ch340')) return 12
  if (mfr.includes('prolific')) return 12
  if (fn.includes('usb serial') || fn.includes('usb-serial')) return 20
  return 100
}

function sortPortsForWeightScan(ports) {
  return [...ports].sort((a, b) => {
    const d = portProbePriority(a) - portProbePriority(b)
    if (d !== 0) return d
    return String(a.path).localeCompare(String(b.path))
  })
}

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
    console.error('[SerialManager] Error creating data directory:', error)
  }
  
  return dataDir
}

// Get paths dynamically (don't call at module load time)
function getDataPaths() {
  const dataDir = getDataDir()
  return {
    DATA_DIR: dataDir,
    LOGS_DIR: path.join(dataDir, 'logs'),
    HISTORY_FILE: path.join(dataDir, 'history.json')
  }
}

// State
let weightPort = null
let mainWindow = null
let reconnectTimer = null
let isReconnecting = false
let readingsBuffer = [] // Last readings for stability detection
let currentStableWeight = null

// Ensure directories exist
function ensureDirectories() {
  try {
    const paths = getDataPaths()
    if (!fs.existsSync(paths.DATA_DIR)) {
      fs.mkdirSync(paths.DATA_DIR, { recursive: true })
    }
    if (!fs.existsSync(paths.LOGS_DIR)) {
      fs.mkdirSync(paths.LOGS_DIR, { recursive: true })
    }
    console.log(`[SerialManager] Directories ensured: ${paths.DATA_DIR}`)
  } catch (error) {
    console.error(`[SerialManager] Error creating directories:`, error)
  }
}

// Initialize history file if it doesn't exist
function initializeHistoryFile() {
  try {
    const paths = getDataPaths()
    if (!fs.existsSync(paths.HISTORY_FILE)) {
      // Create empty file (append-only mode)
      fs.writeFileSync(paths.HISTORY_FILE, '', 'utf8')
      console.log(`[SerialManager] Created history file: ${paths.HISTORY_FILE}`)
    }
  } catch (error) {
    console.error(`[SerialManager] Error initializing history file:`, error)
  }
}

// Get today's log file path
function getLogFilePath() {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const paths = getDataPaths()
  return path.join(paths.LOGS_DIR, `${today}.log`)
}

// Send log to renderer (UI)
function sendLogToRenderer(message, level = 'INFO') {
  if (mainWindow) {
    mainWindow.webContents.send('serial-log', { message, level, timestamp: new Date().toISOString() })
  }
}

// Log to daily log file and send to renderer
function logToFile(message, level = 'INFO') {
  try {
    const logFile = getLogFilePath()
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] [${level}] ${message}\n`
    fs.appendFileSync(logFile, logEntry, 'utf8')
    
    // Also send to renderer for UI display
    sendLogToRenderer(message, level)
  } catch (error) {
    console.error(`[SerialManager] Error writing to log file:`, error)
  }
}

// =XX.YYYY (e.g. 00.0100) → same six-digit reverse family as =000.010 (10 kg)
function canonTwoByFourToThreeThree(matchStr) {
  const m = matchStr.match(/^(\d{2})\.(\d{4})$/)
  if (!m) return matchStr
  return `${m[1].padStart(3, '0')}.${m[2].slice(0, 3)}`
}

// Parse weight frame with reversed format (e.g., "=043.000" → 0.340 kg)
// The device sends weight reversed: 043.000 means 0.340 kg
function parseWeightFrameReversed(frame) {
  if (!frame || typeof frame !== 'string') {
    return null
  }
  
  const trimmed = frame.trim()
  if (!trimmed.startsWith('=')) {
    return null
  }

  // Extract numeric part after '='
  // Pattern: =DDD.DDD (e.g., =043.000)
  const match = trimmed.match(/^=([0-9]{3}\.[0-9]{3})([0-9+-]?)$/)
  if (!match) {
    return null
  }

  const magnitude = match[1] // e.g., "043.000"
  const trail = match[2]
  
  // Reverse the weight: 043.000 → 0.340
  // Split into integer and decimal parts
  const parts = magnitude.split('.')
  if (parts.length !== 2) {
    return null
  }
  
  // Reverse: 043.000 → 0.340
  // Reverse the entire string character by character: 043.000 → 000.340
  const reversedString = magnitude.split('').reverse().join('') // "000.340"
  const reversedValue = parseFloat(reversedString) // 0.340
  let kg = reversedValue

  if (trail === '-') {
    kg = -kg
  }

  return parseFloat(kg.toFixed(3))
}

// Parse weight frame (e.g., "=500.250\r\n" → 500.250)
// This is for the original format (not reversed)
function parseWeightFrame(frame) {
  if (!frame || typeof frame !== 'string') {
    return null
  }
  
  const trimmed = frame.trim()
  if (!trimmed.startsWith('=')) {
    return null
  }

  // Extract numeric part after '='
  // Pattern: =DDD.DDD or =DD.DDD followed by optional sign
  const match = trimmed.match(/^=([0-9]{2,3}\.[0-9]{3})([0-9+-]?)$/)
  if (!match) {
    // Try alternative patterns
    // Pattern: =DDD.DD or =DD.DD (2 decimal places)
    const match2 = trimmed.match(/^=([0-9]{2,3}\.[0-9]{2})([0-9+-]?)$/)
    if (match2) {
      const magnitude = match2[1]
      const trail = match2[2]
      const value = parseFloat(magnitude)
      let kg = value
      if (trail === '-') kg = -kg
      return parseFloat(kg.toFixed(3))
    }
    return null
  }

  const magnitude = match[1]
  const trail = match[2]
  const value = parseFloat(magnitude)
  const intPart = magnitude.split('.')[0]

  let kg
  if (magnitude === '000.010') {
    kg = 10.0
  } else if (intPart.length === 3) {
    kg = value
  } else {
    kg = value * 100000.0
  }

  if (trail === '-') {
    kg = -kg
  }

  return parseFloat(kg.toFixed(3))
}

/**
 * Parse kg from /=([0-9]{2,3}\.[0-9]{2,4})/ capture (continuous stream).
 * YH-T7E-style: =64.1000 → canon "064.100" → six-digit reverse → 1.460 kg (not plain 64.1).
 * =00.0100 → "000.010" → reversed → 10 kg. Do not use parseFloat on the raw 2+4 token.
 */
function kgFromFlexWeightMatch(lastMatch) {
  if (!lastMatch || typeof lastMatch !== 'string') return null

  const matchForParse = /^\d{2}\.\d{4}$/.test(lastMatch)
    ? canonTwoByFourToThreeThree(lastMatch)
    : lastMatch
  const token = `=${matchForParse}`
  let weight = null
  if (/^\d{3}\.\d{3}$/.test(matchForParse)) {
    weight = parseWeightFrameReversed(token)
  } else if (/^\d{2}\.\d{3}$/.test(matchForParse)) {
    weight = parseFloat(matchForParse)
  } else {
    weight = parseWeightFrame(token)
  }
  if (weight !== null && !isNaN(weight) && isFinite(weight)) {
    return weight
  }
  return null
}

// Detect stable weight (5 consecutive identical readings)
function detectStableWeight(weight) {
  readingsBuffer.push(weight)
  
  // Keep only last 5 readings
  if (readingsBuffer.length > STABILITY_THRESHOLD) {
    readingsBuffer.shift()
  }

  // Need at least 5 readings
  if (readingsBuffer.length < STABILITY_THRESHOLD) {
    return null
  }

  // Check if all 5 are identical (rounded to 3 decimals)
  const base = Number(readingsBuffer[0].toFixed(3))
  for (let i = 1; i < STABILITY_THRESHOLD; i++) {
    if (Number(readingsBuffer[i].toFixed(3)) !== base) {
      return null
    }
  }

  return base
}

// Save stable weight to history file (append-only)
function saveStableWeight(weight) {
  try {
    const paths = getDataPaths()
    const record = {
      timestamp: new Date().toISOString(),
      weight: weight
    }
    const jsonLine = JSON.stringify(record) + '\n'
    fs.appendFileSync(paths.HISTORY_FILE, jsonLine, 'utf8')
    logToFile(`Saved stable weight: ${weight} kg`, 'INFO')
  } catch (error) {
    console.error(`[SerialManager] Error saving stable weight:`, error)
    logToFile(`Error saving stable weight: ${error.message}`, 'ERROR')
  }
}

// Setup weight port data handler for continuous stream (no delimiters)
function setupWeightPortHandlerRaw() {
  if (!weightPort) {
    return
  }

  let rawDataBuffer = Buffer.alloc(0)

  weightPort.on('data', (rawData) => {
    // Accumulate raw data
    rawDataBuffer = Buffer.concat([rawDataBuffer, rawData])
    
    // Convert buffer to string and look for weight pattern
    const dataString = rawDataBuffer.toString('ascii')
    
    // 2–3 digits before dot, 2–4 after (4th captures e.g. 00.0100 → 10 kg after canon + reverse)
    const weightPattern = /=([0-9]{2,3}\.[0-9]{2,4})/g
    let match
    let lastMatch = null
    
    while ((match = weightPattern.exec(dataString)) !== null) {
      lastMatch = match[1]
    }
    
    if (lastMatch) {
      const weight = kgFromFlexWeightMatch(lastMatch)

      if (weight !== null && !isNaN(weight) && isFinite(weight)) {
        // Emit live weight reading
        if (mainWindow) {
          mainWindow.webContents.send('weight-live', weight)
        }

        // Check for stability
        const stable = detectStableWeight(weight)
        
        if (stable !== null && stable !== currentStableWeight) {
          currentStableWeight = stable
          
          // Save to history
          saveStableWeight(stable)
          
          // Emit stable weight
          if (mainWindow) {
            mainWindow.webContents.send('weight-stable', stable)
          }
          
          logToFile(`Stable weight detected: ${stable} kg`, 'INFO')
        }
      }
    }
    
    // Keep buffer reasonable size (keep last 200 bytes for pattern matching)
    if (rawDataBuffer.length > 200) {
      rawDataBuffer = rawDataBuffer.slice(-200)
    }
  })

  // Handle port errors
  if (weightPort) {
    weightPort.on('error', (error) => {
      console.error('[SerialManager] Port error:', error)
      logToFile(`Port error: ${error.message}`, 'ERROR')
      handleDisconnection()
    })

    weightPort.on('close', () => {
      console.log('[SerialManager] Port closed')
      logToFile('Port closed', 'INFO')
      handleDisconnection()
    })
  }
}

// Handle disconnection
function handleDisconnection() {
  const portPath = weightPort ? weightPort.path : null
  
  if (weightPort) {
    try {
      if (weightPort.isOpen) {
        logToFile(`🔌 Closing port ${portPath}...`, 'INFO')
        weightPort.close()
        // Wait a bit for port to be fully released
        setTimeout(() => {
          weightPort = null
        }, 500)
      } else {
        weightPort = null
      }
    } catch (error) {
      logToFile(`⚠️ Error closing port: ${error.message}`, 'WARN')
      weightPort = null
    }
  }

  readingsBuffer = []
  currentStableWeight = null
  
  sendConnectionStatus('disconnected', portPath)

  // Clear existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  // Schedule reconnect
  scheduleReconnect()
}

// Schedule automatic reconnect
function scheduleReconnect() {
  if (isReconnecting || reconnectTimer) {
    return
  }

  isReconnecting = true
  logToFile(`⏰ Scheduling automatic reconnect in ${RECONNECT_DELAY / 1000} seconds...`, 'INFO')

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    isReconnecting = false
    logToFile('🔄 Automatic reconnect triggered', 'INFO')
    scanAndConnect()
  }, RECONNECT_DELAY)
}

// Test if a port is sending weight data
async function testPort(portPath) {
  let testPort = null
  try {
    logToFile(
      `Testing port ${portPath} @ ${BAUD_RATE} baud, ${DATA_BITS}${PARITY === 'none' ? 'N' : PARITY[0].toUpperCase()}${STOP_BITS}, handshaking none (rtscts=${RTSCTS})`,
      'INFO'
    )

    testPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
      dataBits: DATA_BITS,
      parity: PARITY,
      stopBits: STOP_BITS,
      rtscts: RTSCTS,
    })

    // Wait for port to open
    await new Promise((resolve, reject) => {
      testPort.on('open', () => {
        logToFile(`Port ${portPath} opened successfully`, 'INFO')
        resolve()
      })
      testPort.on('error', (error) => {
        if (error.message.includes('Access denied') || error.code === 'EACCES') {
          logToFile(`Port ${portPath} access denied (may be in use)`, 'WARN')
          reject(new Error('Access denied'))
        } else {
          logToFile(`Port ${portPath} error: ${error.message}`, 'ERROR')
          reject(error)
        }
      })
      setTimeout(() => {
        logToFile(`Port ${portPath} open timeout`, 'WARN')
        reject(new Error('Port open timeout'))
      }, 500)
    })

    // Device sends continuous stream without delimiters (e.g. =24.1000=24.1000… or =043.000…)
    logToFile(`Waiting for weight data from ${portPath} (timeout: 5 seconds)...`, 'INFO')
    logToFile(`Parsing continuous stream (no delimiters)`, 'INFO')

    let rawDataBuffer = Buffer.alloc(0)
    let dataReceived = false
    let validWeightFound = false
    
    const testPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testPort.close()
        if (!dataReceived) {
          logToFile(`No data received from ${portPath} within 5 seconds`, 'WARN')
          logToFile(`💡 Check: 1) Device is powered on, 2) Cable is connected, 3) Device is sending data`, 'INFO')
          reject(new Error('Timeout - no data received'))
        } else if (!validWeightFound) {
          logToFile(`Data received from ${portPath} but no valid weight frames found`, 'WARN')
          logToFile(`💡 The device is sending data but in a different format than expected`, 'INFO')
          logToFile(`💡 Expected: =weight with 2–3 digits and 2–4 decimals (e.g. =24.1000 or =043.000)`, 'INFO')
          reject(new Error('No valid weight frames'))
        }
      }, 5000)

      // Listen to raw data stream (no parser - continuous stream)
      testPort.on('data', (rawData) => {
        if (!dataReceived) {
          dataReceived = true
          logToFile(`✅ Data received from ${portPath}!`, 'INFO')
        }
        
        // Accumulate raw data
        rawDataBuffer = Buffer.concat([rawDataBuffer, rawData])
        
        // Log first sample of raw data
        if (rawDataBuffer.length >= 20 && !validWeightFound) {
          const sample = rawDataBuffer.slice(0, 50).toString('ascii')
          const hex = rawDataBuffer.slice(0, 50).toString('hex')
          logToFile(`Raw data sample (ascii): ${sample}`, 'INFO')
          logToFile(`Raw data sample (hex): ${hex}`, 'INFO')
        }
        
        // Same flex pattern as live stream: =24.1000, =043.000, =00.0100, etc.
        const dataString = rawDataBuffer.toString('ascii')
        const weightPattern = /=([0-9]{2,3}\.[0-9]{2,4})/g
        let match
        let lastMatch = null
        while ((match = weightPattern.exec(dataString)) !== null) {
          lastMatch = match[1]
        }

        if (lastMatch) {
          const weight = kgFromFlexWeightMatch(lastMatch)
          if (weight !== null) {
            clearTimeout(timeout)
            validWeightFound = true
            logToFile(`✅ Port ${portPath} is sending valid weight data: ${weight} kg (from =${lastMatch})`, 'INFO')
            testPort.removeAllListeners('data')
            resolve(weight)
          }
        }
        
        // Keep buffer reasonable size (keep last 200 bytes for pattern matching)
        if (rawDataBuffer.length > 200) {
          rawDataBuffer = rawDataBuffer.slice(-200)
        }
      })

      testPort.once('error', (error) => {
        clearTimeout(timeout)
        logToFile(`Port ${portPath} error during test: ${error.message}`, 'ERROR')
        reject(error)
      })
    })

    const testWeight = await testPromise
    testPort.close()
    await new Promise(resolve => setTimeout(resolve, 200))
    
    return true
  } catch (error) {
    if (testPort && testPort.isOpen) {
      try {
        testPort.close()
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (closeError) {
        // Ignore
      }
    }
    throw error
  }
}

// Send connection status to renderer (include baud / frame so UI is not blank or misleading)
function sendConnectionStatus(status, portPath = null) {
  if (!mainWindow) return
  const payload = { status, port: portPath }
  if (status === 'connecting' || status === 'connected') {
    payload.baud = BAUD_RATE
    const p =
      PARITY === 'none' ? 'N' : PARITY === 'even' ? 'E' : PARITY === 'odd' ? 'O' : 'N'
    payload.lineCoding = `${DATA_BITS}${p}${STOP_BITS}`
  }
  mainWindow.webContents.send('serial-status', payload)
}

// Connect to a specific port
async function connectToPort(portPath) {
  try {
    // Check if already connected to this port
    if (weightPort && weightPort.path === portPath && weightPort.isOpen) {
      logToFile(`✅ Already connected to ${portPath}, using existing connection`, 'INFO')
      sendConnectionStatus('connected', portPath)
      return true
    }
    
    logToFile(
      `🔗 Connecting to ${portPath} @ ${BAUD_RATE} baud, ${DATA_BITS}${PARITY === 'none' ? 'N' : PARITY[0].toUpperCase()}${STOP_BITS}, handshaking none`,
      'INFO'
    )
    sendConnectionStatus('connecting', portPath)

    // Close existing connection if different port
    if (weightPort && weightPort.path !== portPath) {
      try {
        if (weightPort.isOpen) {
          logToFile(`🔌 Closing previous connection to ${weightPort.path}...`, 'INFO')
          weightPort.close()
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (closeError) {
        // Ignore
      }
      weightPort = null
    }

    weightPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
      dataBits: DATA_BITS,
      parity: PARITY,
      stopBits: STOP_BITS,
      rtscts: RTSCTS,
    })

    // Wait for port to open
    await new Promise((resolve, reject) => {
      weightPort.on('open', () => {
        logToFile(`✅ Port ${portPath} opened successfully`, 'INFO')
        resolve()
      })
      weightPort.on('error', (error) => {
        // If access denied, it might already be open - try to use existing connection
        if (error.message.includes('Access denied') || error.code === 'EACCES') {
          logToFile(`⚠️ Port ${portPath} access denied - might already be in use`, 'WARN')
          // Don't reject immediately - let the caller handle retry
          reject(error)
        } else {
          logToFile(`❌ Port ${portPath} error: ${error.message}`, 'ERROR')
          reject(error)
        }
      })
      setTimeout(() => {
        logToFile(`⏱️ Port ${portPath} open timeout (500ms)`, 'WARN')
        reject(new Error('Port open timeout'))
      }, 500)
    })

    // Device sends continuous stream without delimiters
    // Parse raw data directly instead of using ReadlineParser
    logToFile(`📡 Using raw data parser (continuous stream, no delimiters)`, 'INFO')
    setupWeightPortHandlerRaw()

    logToFile(`✅ Successfully connected to ${portPath} @ ${BAUD_RATE} baud`, 'INFO')
    logToFile(`📊 Listening for weight data...`, 'INFO')
    console.log(`[SerialManager] ✅ Connected to ${portPath} @ ${BAUD_RATE} baud`)
    sendConnectionStatus('connected', portPath)

    // Clear reconnect timer if connection successful
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
      logToFile('🔄 Reconnect timer cleared (connection successful)', 'INFO')
    }
    isReconnecting = false

    return true
  } catch (error) {
    logToFile(`❌ Failed to connect to ${portPath}: ${error.message}`, 'ERROR')
    console.error(`[SerialManager] Error connecting to ${portPath}:`, error)
    sendConnectionStatus('disconnected', portPath)
    
    if (weightPort) {
      try {
        if (weightPort.isOpen) {
          weightPort.close()
          logToFile(`🔌 Closed port ${portPath} after connection failure`, 'INFO')
        }
      } catch (closeError) {
        // Ignore
      }
      weightPort = null
    }
    
    return false
  }
}

// Scan and connect to available ports
async function scanAndConnect() {
  // Check if already connected and working
  if (weightPort && weightPort.isOpen) {
    logToFile(`✅ Already connected to ${weightPort.path}, checking if still working...`, 'INFO')
    
    // Check if we're receiving data (if we have recent stable weight, port is working)
    if (currentStableWeight !== null) {
      logToFile(`✅ Port ${weightPort.path} is working and receiving data (stable weight: ${currentStableWeight} kg)`, 'INFO')
      sendConnectionStatus('connected', weightPort.path)
      return // Already connected and working, no need to scan
    }
    
    // If no stable weight but port is open, keep it and don't close
    logToFile(`⚠️ Port ${weightPort.path} is open but no stable weight yet, keeping connection...`, 'INFO')
    sendConnectionStatus('connecting', weightPort.path)
    return
  }

  try {
    // Only close existing connection if it's not working
    if (weightPort && !weightPort.isOpen) {
      weightPort = null
    }

    logToFile('🔍 Starting scan for available COM ports...', 'INFO')
    sendConnectionStatus('connecting')
    const ports = await SerialPort.list()
    const sortedPorts = sortPortsForWeightScan(ports)
    logToFile(`📋 Found ${sortedPorts.length} COM port(s) available (USB scale candidates first, AMT/Bluetooth last)`, 'INFO')
    
    if (sortedPorts.length === 0) {
      logToFile('⚠️ No COM ports found on system', 'WARN')
      sendConnectionStatus('disconnected')
      scheduleReconnect()
      return
    }
    
    // List all ports found (order is probe order)
    sortedPorts.forEach((portInfo, index) => {
      logToFile(`  ${index + 1}. ${portInfo.path} - ${portInfo.manufacturer || 'Unknown'} ${portInfo.vendorId ? `(VID: ${portInfo.vendorId})` : ''}`, 'INFO')
    })

    // Separate ports into two groups: those with access denied and others
    const accessDeniedPorts = []
    const otherPorts = []

    // Try each port (sorted: weight-scale USB adapters before Intel SOL / Bluetooth)
    for (let i = 0; i < sortedPorts.length; i++) {
      const portInfo = sortedPorts[i]
      const portPath = portInfo.path
      
      logToFile(`\n🔌 Testing port ${i + 1}/${sortedPorts.length}: ${portPath}`, 'INFO')

      try {
        // Check if this port is already connected and working
        if (weightPort && weightPort.path === portPath && weightPort.isOpen) {
          logToFile(`✅ Port ${portPath} is already connected and working!`, 'INFO')
          sendConnectionStatus('connected', portPath)
          return // Already connected, no need to test
        }
        
        // Test if port sends weight data
        await testPort(portPath)
        
        // If test passed, connect
        logToFile(`\n🔗 Connecting to ${portPath}...`, 'INFO')
        const connected = await connectToPort(portPath)
        if (connected) {
          logToFile(`✅ Successfully connected to weight machine on ${portPath}`, 'INFO')
          return // Successfully connected
        }
      } catch (error) {
        // Port test failed, categorize the error
        if (error.message.includes('Access denied')) {
          // Check if this port is already connected (might be from previous session)
          if (weightPort && weightPort.path === portPath && weightPort.isOpen) {
            logToFile(`✅ Port ${portPath} is already connected! Using existing connection...`, 'INFO')
            sendConnectionStatus('connected', portPath)
            return // Use existing connection
          }
          
          logToFile(`⚠️ Port ${portPath} is in use (Access denied) - will retry immediately...`, 'WARN')
          accessDeniedPorts.push(portInfo)
        } else {
          logToFile(`⚠️ Port ${portPath} test failed: ${error.message} - trying next port...`, 'WARN')
          otherPorts.push(portInfo)
        }
        continue
      }

      // Small delay between port attempts
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    // If no port worked, retry access-denied ports immediately (they might be the weight machine)
    if (accessDeniedPorts.length > 0) {
      logToFile(`\n🔄 Retrying ${accessDeniedPorts.length} port(s) that had access denied...`, 'INFO')
      logToFile('💡 These ports might be the weight machine - trying to connect immediately...', 'INFO')
      
      for (const portInfo of accessDeniedPorts) {
        const portPath = portInfo.path
        logToFile(`\n🔌 Attempting to connect to port: ${portPath}`, 'INFO')
        
        // Try to connect directly without testing (port might already be open)
        try {
          // First, try to connect directly (in case port is already open from another process)
          const connected = await connectToPort(portPath)
          if (connected) {
            logToFile(`✅ Successfully connected to weight machine on ${portPath}`, 'INFO')
            return // Successfully connected
          }
        } catch (connectError) {
          // If direct connect fails, try testing first
          logToFile(`⚠️ Direct connect failed, testing port ${portPath}...`, 'WARN')
          
          try {
            // Wait a bit for port to be released
            await new Promise(resolve => setTimeout(resolve, 1000))
            await testPort(portPath)
            logToFile(`\n🔗 Connecting to ${portPath}...`, 'INFO')
            const connected = await connectToPort(portPath)
            if (connected) {
              logToFile(`✅ Successfully connected to weight machine on ${portPath}`, 'INFO')
              return // Successfully connected
            }
          } catch (error) {
            logToFile(`⚠️ Port ${portPath} still unavailable: ${error.message}`, 'WARN')
            continue
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }

    // No valid port found
    logToFile(`\n❌ No valid weight device found after testing all ${sortedPorts.length} port(s)`, 'WARN')
    logToFile('💡 Make sure the weight machine is: 1) Plugged in, 2) Powered on, 3) Sending data', 'INFO')
    logToFile('💡 If a port shows "Access denied", close any other apps using that port and click "Reconnect"', 'INFO')
    sendConnectionStatus('disconnected')
    scheduleReconnect()
  } catch (error) {
    console.error('[SerialManager] Error scanning ports:', error)
    logToFile(`❌ Error scanning ports: ${error.message}`, 'ERROR')
    sendConnectionStatus('disconnected')
    scheduleReconnect()
  }
}

// Manual reconnect request
async function requestReconnect() {
  logToFile('🔄 Manual reconnect requested by user', 'INFO')
  
  // Clear existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    logToFile('⏰ Cleared existing reconnect timer', 'INFO')
  }
  
  isReconnecting = false
  
  // Disconnect current connection
  if (weightPort) {
    const portPath = weightPort.path
    try {
      if (weightPort.isOpen) {
        logToFile(`🔌 Closing current connection to ${portPath}...`, 'INFO')
        weightPort.close()
        // Wait longer for port to be fully released
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      logToFile(`⚠️ Error closing port: ${error.message}`, 'WARN')
    }
    weightPort = null
    logToFile('✅ Port closed and reset', 'INFO')
  }
  
  readingsBuffer = []
  currentStableWeight = null
  
  // Wait a bit longer for port to be released (especially important for access-denied ports)
  logToFile('⏳ Waiting 2 seconds for port to be fully released...', 'INFO')
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Start scanning immediately
  logToFile('🚀 Starting immediate scan...', 'INFO')
  await scanAndConnect()
}

// Start serial manager
function startSerialManager(window) {
  mainWindow = window
  
  const paths = getDataPaths()
  logToFile('🚀 SerialManager initializing...', 'INFO')
  logToFile(`📁 Data directory: ${paths.DATA_DIR}`, 'INFO')
  logToFile(`📝 Log directory: ${paths.LOGS_DIR}`, 'INFO')
  logToFile(`📊 History file: ${paths.HISTORY_FILE}`, 'INFO')
  
  // Ensure directories exist
  ensureDirectories()
  initializeHistoryFile()
  
  logToFile('✅ SerialManager initialized', 'INFO')
  logToFile(`⚙️ Configuration: ${BAUD_RATE} baud, ${DATA_BITS} data bits, ${PARITY} parity, ${STOP_BITS} stop bits`, 'INFO')
  logToFile(`📏 Stability threshold: ${STABILITY_THRESHOLD} consecutive identical readings`, 'INFO')
  logToFile(`🔄 Auto-reconnect delay: ${RECONNECT_DELAY / 1000} seconds`, 'INFO')
  console.log('[SerialManager] Initialized')
  
  // Start scanning after a short delay
  logToFile('⏰ Starting initial scan in 1 second...', 'INFO')
  setTimeout(() => {
    logToFile('🚀 Starting initial connection scan...', 'INFO')
    scanAndConnect()
  }, 1000)
}

// Cleanup on app quit
function cleanup() {
  logToFile('SerialManager cleanup', 'INFO')
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  
  if (weightPort) {
    try {
      if (weightPort.isOpen) {
        weightPort.close()
      }
    } catch (error) {
      // Ignore
    }
    weightPort = null
  }
}

module.exports = {
  startSerialManager,
  cleanup,
  requestReconnect,
  scanAndConnect
}

