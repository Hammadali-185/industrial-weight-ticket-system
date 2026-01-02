const { contextBridge, ipcRenderer } = require('electron')

console.log('[Preload] ✅ Preload script loaded and executing...')
console.log('[Preload] contextBridge available:', typeof contextBridge !== 'undefined')
console.log('[Preload] ipcRenderer available:', typeof ipcRenderer !== 'undefined')

try {
  // Expose secure bridge to renderer process
  console.log('[Preload] Attempting to expose nativeAPI...')
  contextBridge.exposeInMainWorld('nativeAPI', {
  // Weight event listeners (from main process to renderer)
  onWeightLive: (callback) => {
    ipcRenderer.on('weight-live', (_, weight) => callback(weight))
  },
  
  onWeightStable: (callback) => {
    ipcRenderer.on('weight-stable', (_, weight) => callback(weight))
  },
  
  // Connection status listener
  onSerialStatus: (callback) => {
    ipcRenderer.on('serial-status', (_, status) => callback(status))
  },
  
  // Serial log listener (for detailed logging)
  onSerialLog: (callback) => {
    ipcRenderer.on('serial-log', (_, logData) => callback(logData))
  },
  
  // Manual reconnect request
  requestReconnect: () => {
    return ipcRenderer.invoke('request-reconnect')
  },
  
  // Storage operations (for UI lists)
  readHistory: () => ipcRenderer.invoke('read-history'),
  saveHistory: (data) => ipcRenderer.invoke('save-history', data),
  
  // Payment operations
  readPayments: () => ipcRenderer.invoke('read-payments'),
  savePayments: (data) => ipcRenderer.invoke('save-payments', data),
  
  // List file operations
  saveListFile: (data) => ipcRenderer.invoke('save-list-file', data),
  readListings: () => ipcRenderer.invoke('read-listings'),
  
  // Log operations
  readLogs: (date) => ipcRenderer.invoke('read-logs', date),
  
  // Google Drive operations
  googleDriveGetAuthUrl: () => ipcRenderer.invoke('google-drive-get-auth-url'),
  googleDriveAuthCode: (code) => ipcRenderer.invoke('google-drive-auth-code', code),
  googleDriveCheckAuth: () => ipcRenderer.invoke('google-drive-check-auth'),
  googleDriveUpload: (historyData) => ipcRenderer.invoke('google-drive-upload', historyData),
  googleDriveDownload: () => ipcRenderer.invoke('google-drive-download'),
  googleDriveRevoke: () => ipcRenderer.invoke('google-drive-revoke'),
  
  // Remove listeners
  removeWeightLiveListener: () => {
    ipcRenderer.removeAllListeners('weight-live')
  },
  
  removeWeightStableListener: () => {
    ipcRenderer.removeAllListeners('weight-stable')
  },
  
  removeSerialStatusListener: () => {
    ipcRenderer.removeAllListeners('serial-status')
  },
  
  removeSerialLogListener: () => {
    ipcRenderer.removeAllListeners('serial-log')
  }
  })
  
  console.log('[Preload] ✅ nativeAPI exposed successfully')
  console.log('[Preload] Available methods:', Object.keys({
    onWeightLive: () => {},
    onWeightStable: () => {},
    onSerialStatus: () => {},
    onSerialLog: () => {},
    requestReconnect: () => {},
    readHistory: () => {},
    saveHistory: () => {},
    readPayments: () => {},
    savePayments: () => {},
    saveListFile: () => {},
    readListings: () => {},
    readLogs: () => {},
    googleDriveGetAuthUrl: () => {},
    googleDriveAuthCode: () => {},
    googleDriveCheckAuth: () => {},
    googleDriveUpload: () => {},
    googleDriveDownload: () => {},
    googleDriveRevoke: () => {}
  }))
} catch (error) {
  console.error('[Preload] ❌ Error exposing nativeAPI:', error)
  console.error('[Preload] Error message:', error.message)
  console.error('[Preload] Error stack:', error.stack)
  // Try to expose a minimal API to help debug
  try {
    contextBridge.exposeInMainWorld('preloadError', {
      error: error.message,
      stack: error.stack
    })
  } catch (e) {
    console.error('[Preload] Could not even expose error:', e)
  }
}

