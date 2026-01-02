// Unified storage utility for persistent history storage
// Uses nativeAPI (Electron IPC) for file-based storage in app's userData directory

// Check if running in Electron with nativeAPI
const isElectron = () => {
  const hasWindow = typeof window !== 'undefined'
  const hasNativeAPI = hasWindow && window.nativeAPI
  if (!hasWindow) {
    console.warn('[Storage] window is undefined')
  } else if (!hasNativeAPI) {
    console.warn('[Storage] window.nativeAPI is not available. Available keys:', Object.keys(window))
  }
  return hasNativeAPI
}

// No initialization needed - nativeAPI handles everything via IPC

// ===== FILE SYSTEM FUNCTIONS (Electron via nativeAPI) =====

// Save history to file system via nativeAPI
const saveHistoryFileSystem = async (historyArray) => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.saveHistory) {
      console.error('[Storage] nativeAPI.saveHistory not available')
      console.error('[Storage] window:', typeof window !== 'undefined' ? 'exists' : 'undefined')
      console.error('[Storage] window.nativeAPI:', typeof window !== 'undefined' && window.nativeAPI ? 'exists' : 'undefined')
      return false
    }
    
    console.log(`[Storage] Calling nativeAPI.saveHistory with ${historyArray.length} items...`)
    const result = await window.nativeAPI.saveHistory(historyArray)
    
    if (result) {
      console.log(`[Storage] ✅ Successfully saved ${historyArray.length} items to app's userData directory`)
      return true
    } else {
      console.error('[Storage] ❌ Failed to save history - IPC returned false')
      return false
    }
  } catch (error) {
    console.error('[Storage] ❌ Error saving history:', error)
    console.error('[Storage] Error stack:', error.stack)
    return false
  }
}

// Load history from file system via nativeAPI
const loadHistoryFileSystem = async () => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.readHistory) {
      console.error('[Storage] nativeAPI.readHistory not available')
      console.error('[Storage] window:', typeof window !== 'undefined' ? 'exists' : 'undefined')
      console.error('[Storage] window.nativeAPI:', typeof window !== 'undefined' && window.nativeAPI ? 'exists' : 'undefined')
      return []
    }
    
    const history = await window.nativeAPI.readHistory()
    console.log(`[Storage] Loaded ${history.length} items from app's userData directory`)
    
    // Ensure result is an array
    if (!Array.isArray(history)) {
      console.warn('[Storage] History is not an array, converting...', history)
      return []
    }
    
    return history
  } catch (error) {
    console.error('[Storage] Error loading history:', error)
    console.error('[Storage] Error stack:', error.stack)
    return []
  }
}


// ===== UNIFIED API (Uses nativeAPI for Electron) =====

// Save history (uses file system via nativeAPI)
export const saveHistory = async (historyArray) => {
  // Validate input
  if (!Array.isArray(historyArray)) {
    console.error('[saveHistory] historyArray is not an array:', historyArray)
    return false
  }
  
  console.log(`[saveHistory] Saving ${historyArray.length} history items`)
  
  if (!isElectron()) {
    console.error('[saveHistory] Not running in Electron - nativeAPI not available')
    return false
  }
  
  const result = await saveHistoryFileSystem(historyArray)
  
  if (result) {
    console.log(`[saveHistory] Successfully saved ${historyArray.length} items`)
  } else {
    console.error(`[saveHistory] Failed to save ${historyArray.length} items`)
  }
  
  return result
}

// Load history (uses file system via nativeAPI)
export const loadHistory = async () => {
  if (!isElectron()) {
    console.error('[loadHistory] Not running in Electron - nativeAPI not available')
    return []
  }
  
  const result = await loadHistoryFileSystem()
  console.log(`[loadHistory] Loaded ${result.length} history items`)
  return result
}

// Clear all history (local only, keeps Google Drive backup)
export const clearHistory = async () => {
  if (!isElectron()) {
    console.error('[clearHistory] Not running in Electron - nativeAPI not available')
    return false
  }
  
  // Save empty array to clear local history
  // Google Drive backup is NOT deleted - user can restore later
  return await saveHistory([])
}

// Delete a specific item from history
export const deleteHistoryItem = async (id) => {
  try {
    const currentHistory = await loadHistory()
    const updatedHistory = currentHistory.filter(item => item.id !== id)
    await saveHistory(updatedHistory)
    return true
  } catch (error) {
    console.error('Error deleting item:', error)
    return false
  }
}

// Get storage type (for debugging/info)
export const getStorageType = () => {
  return isElectron() ? 'file-system' : 'none'
}

// ===== PAYMENT STORAGE FUNCTIONS =====

// Save payments to file system via nativeAPI
const savePaymentsFileSystem = async (paymentsObject) => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.savePayments) {
      console.error('[Storage] nativeAPI.savePayments not available')
      return false
    }
    
    const result = await window.nativeAPI.savePayments(paymentsObject)
    if (result) {
      const paymentCount = Object.keys(paymentsObject).length
      console.log(`[Storage] Saved ${paymentCount} payment(s) to app's userData directory`)
      return true
    } else {
      console.error('[Storage] Failed to save payments')
      return false
    }
  } catch (error) {
    console.error('[Storage] Error saving payments:', error)
    return false
  }
}

// Load payments from file system via nativeAPI
const loadPaymentsFileSystem = async () => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.readPayments) {
      console.error('[Storage] nativeAPI.readPayments not available')
      return {}
    }
    
    const payments = await window.nativeAPI.readPayments()
    console.log(`[Storage] Loaded ${Object.keys(payments).length} payment(s) from app's userData directory`)
    
    // Ensure result is an object
    if (typeof payments !== 'object' || Array.isArray(payments)) {
      console.warn('[Storage] Payments is not an object, converting...', payments)
      return {}
    }
    
    return payments
  } catch (error) {
    console.error('[Storage] Error loading payments:', error)
    console.error('[Storage] Error stack:', error.stack)
    return {}
  }
}

// Save payments (uses file system via nativeAPI)
export const savePayments = async (paymentsObject) => {
  // Validate input
  if (typeof paymentsObject !== 'object' || Array.isArray(paymentsObject)) {
    console.error('[savePayments] paymentsObject is not an object:', paymentsObject)
    return false
  }
  
  console.log(`[savePayments] Saving ${Object.keys(paymentsObject).length} payment(s)`)
  
  if (!isElectron()) {
    console.error('[savePayments] Not running in Electron - nativeAPI not available')
    return false
  }
  
  const result = await savePaymentsFileSystem(paymentsObject)
  
  if (result) {
    console.log(`[savePayments] Successfully saved ${Object.keys(paymentsObject).length} payment(s)`)
  } else {
    console.error(`[savePayments] Failed to save ${Object.keys(paymentsObject).length} payment(s)`)
  }
  
  return result
}

// Load payments (uses file system via nativeAPI)
export const loadPayments = async () => {
  if (!isElectron()) {
    console.error('[loadPayments] Not running in Electron - nativeAPI not available')
    return {}
  }
  
  const result = await loadPaymentsFileSystem()
  console.log(`[loadPayments] Loaded ${Object.keys(result).length} payment(s)`)
  return result
}

// ===== LISTINGS STORAGE FUNCTIONS =====

// Load listings from file system via nativeAPI
const loadListingsFileSystem = async () => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.readListings) {
      console.error('[Storage] nativeAPI.readListings not available')
      return []
    }
    
    const listings = await window.nativeAPI.readListings()
    console.log(`[Storage] Loaded ${listings.length} listing(s) from app's userData directory`)
    
    // Ensure result is an array
    if (!Array.isArray(listings)) {
      console.warn('[Storage] Listings is not an array, converting...', listings)
      return []
    }
    
    return listings
  } catch (error) {
    console.error('[Storage] Error loading listings:', error)
    console.error('[Storage] Error stack:', error.stack)
    return []
  }
}

// Load listings (uses file system via nativeAPI)
export const loadListings = async () => {
  if (!isElectron()) {
    console.error('[loadListings] Not running in Electron - nativeAPI not available')
    return []
  }
  
  const result = await loadListingsFileSystem()
  console.log(`[loadListings] Loaded ${result.length} listing(s)`)
  return result
}

// ===== LOGS STORAGE FUNCTIONS =====

// Load logs from file system via nativeAPI
const loadLogsFileSystem = async (date) => {
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.readLogs) {
      console.error('[Storage] nativeAPI.readLogs not available')
      return date ? null : []
    }
    
    const logs = await window.nativeAPI.readLogs(date)
    
    if (date) {
      // Single log file requested
      console.log(`[Storage] Loaded log file for date: ${date}`)
      return logs
    } else {
      // List of log files
      console.log(`[Storage] Loaded ${logs.length} log file(s) from app's userData directory`)
      
      // Ensure result is an array
      if (!Array.isArray(logs)) {
        console.warn('[Storage] Logs is not an array, converting...', logs)
        return []
      }
      
      return logs
    }
  } catch (error) {
    console.error('[Storage] Error loading logs:', error)
    console.error('[Storage] Error stack:', error.stack)
    return date ? null : []
  }
}

// Load logs (uses file system via nativeAPI)
// If date is provided, returns single log file content
// If date is not provided, returns list of all log files
export const loadLogs = async (date) => {
  if (!isElectron()) {
    console.error('[loadLogs] Not running in Electron - nativeAPI not available')
    return date ? null : []
  }
  
  const result = await loadLogsFileSystem(date)
  
  if (date) {
    console.log(`[loadLogs] Loaded log file for date: ${date}`)
  } else {
    console.log(`[loadLogs] Loaded ${result.length} log file(s)`)
  }
  
  return result
}

// ===== GOOGLE DRIVE FUNCTIONS =====

// Check if Google Drive is authenticated
export const checkGoogleDriveAuth = async () => {
  if (!isElectron()) {
    return { success: false, isAuthenticated: false }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveCheckAuth) {
      return { success: false, isAuthenticated: false }
    }
    
    const result = await window.nativeAPI.googleDriveCheckAuth()
    return result
  } catch (error) {
    console.error('[Storage] Error checking Google Drive auth:', error)
    return { success: false, isAuthenticated: false }
  }
}

// Get Google Drive authorization URL
export const getGoogleDriveAuthUrl = async () => {
  console.log('[Storage] getGoogleDriveAuthUrl called')
  console.log('[Storage] window exists:', typeof window !== 'undefined')
  console.log('[Storage] window.nativeAPI exists:', typeof window !== 'undefined' && !!window.nativeAPI)
  
  if (!isElectron()) {
    console.error('[Storage] Not in Electron - window.nativeAPI not available')
    return { success: false, error: 'Not in Electron - Make sure you are running the Electron app, not opening in a browser' }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveGetAuthUrl) {
      console.error('[Storage] nativeAPI.googleDriveGetAuthUrl not available')
      console.error('[Storage] Available nativeAPI methods:', window.nativeAPI ? Object.keys(window.nativeAPI) : 'none')
      return { success: false, error: 'nativeAPI.googleDriveGetAuthUrl not available' }
    }
    
    console.log('[Storage] Calling window.nativeAPI.googleDriveGetAuthUrl()...')
    const result = await window.nativeAPI.googleDriveGetAuthUrl()
    console.log('[Storage] Auth URL result:', result)
    return result
  } catch (error) {
    console.error('[Storage] Error getting Google Drive auth URL:', error)
    console.error('[Storage] Error stack:', error.stack)
    return { success: false, error: error.message }
  }
}

// Authenticate with Google Drive using authorization code
export const authenticateGoogleDrive = async (code) => {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron' }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveAuthCode) {
      return { success: false, error: 'nativeAPI not available' }
    }
    
    const result = await window.nativeAPI.googleDriveAuthCode(code)
    return result
  } catch (error) {
    console.error('[Storage] Error authenticating Google Drive:', error)
    return { success: false, error: error.message }
  }
}

// Upload history to Google Drive
export const uploadHistoryToDrive = async (historyData) => {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron' }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveUpload) {
      return { success: false, error: 'nativeAPI not available' }
    }
    
    const result = await window.nativeAPI.googleDriveUpload(historyData)
    return result
  } catch (error) {
    console.error('[Storage] Error uploading to Google Drive:', error)
    return { success: false, error: error.message }
  }
}

// Download history from Google Drive
export const downloadHistoryFromDrive = async () => {
  if (!isElectron()) {
    return { success: false, data: null, error: 'Not in Electron' }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveDownload) {
      return { success: false, data: null, error: 'nativeAPI not available' }
    }
    
    const result = await window.nativeAPI.googleDriveDownload()
    return result
  } catch (error) {
    console.error('[Storage] Error downloading from Google Drive:', error)
    return { success: false, data: null, error: error.message }
  }
}

// Revoke Google Drive access
export const revokeGoogleDriveAccess = async () => {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron' }
  }
  
  try {
    if (typeof window === 'undefined' || !window.nativeAPI || !window.nativeAPI.googleDriveRevoke) {
      return { success: false, error: 'nativeAPI not available' }
    }
    
    const result = await window.nativeAPI.googleDriveRevoke()
    return result
  } catch (error) {
    console.error('[Storage] Error revoking Google Drive access:', error)
    return { success: false, error: error.message }
  }
}
