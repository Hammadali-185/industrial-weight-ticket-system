// Preload script for Electron
// This file will be used when converting the app to Electron
// It exposes safe APIs to the renderer process

const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')

// Expose protected methods that allow the renderer process to use
// the file system APIs without exposing the entire Node.js API
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  fs: {
    readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
    writeFile: (filePath, data, encoding) => fs.writeFile(filePath, data, encoding),
    unlink: (filePath) => fs.unlink(filePath),
    exists: (filePath) => fsSync.existsSync(filePath),
    mkdir: (dirPath, options) => fs.mkdir(dirPath, options)
  },
  
  // Path operations
  path: {
    join: (...args) => path.join(...args),
    dirname: (filePath) => path.dirname(filePath),
    resolve: (...args) => path.resolve(...args)
  },
  
  // Get user data path (where app data is stored)
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => process.platform
})








