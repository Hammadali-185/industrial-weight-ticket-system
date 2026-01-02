import React, { useState, useEffect } from 'react'
import { loadHistory, saveHistory, clearHistory, deleteHistoryItem, loadListings, checkGoogleDriveAuth, getGoogleDriveAuthUrl, authenticateGoogleDrive, downloadHistoryFromDrive, revokeGoogleDriveAccess, uploadHistoryToDrive } from '../utils/storage'

const History = () => {
  const [activeTab, setActiveTab] = useState('history') // 'history', 'listings'
  const [history, setHistory] = useState([])
  const [listings, setListings] = useState([])
  const [searchName, setSearchName] = useState('')
  const [filteredHistory, setFilteredHistory] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [filterDate, setFilterDate] = useState('') // Date filter state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false)
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false)
  const [showAuthCodeInput, setShowAuthCodeInput] = useState(false)
  const [authCodeInput, setAuthCodeInput] = useState('')

  // Load data from storage on mount and when page becomes visible
  useEffect(() => {
    loadAllData()
    
    // Reload data when page becomes visible (user navigates back to History page)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[History] Page visible, reloading data...')
        loadAllData()
      }
    }
    
    // Reload when window gains focus (user switches back to app)
    const handleFocus = () => {
      console.log('[History] Window focused, reloading data...')
      loadAllData()
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Load all data (history, listings)
  const loadAllData = async () => {
    await Promise.all([
      loadHistoryFromStorage(),
      loadListingsFromStorage(),
      checkGoogleDriveStatus()
    ])
  }

  // Check Google Drive connection status
  const checkGoogleDriveStatus = async () => {
    try {
      const result = await checkGoogleDriveAuth()
      setGoogleDriveConnected(result.isAuthenticated || false)
    } catch (error) {
      console.error('[History] Error checking Google Drive status:', error)
      setGoogleDriveConnected(false)
    }
  }

  // Filter history when searchName or filterDate changes
  useEffect(() => {
    try {
      // Ensure history is an array
      if (!Array.isArray(history)) {
        console.warn('[History] History is not an array in filter effect:', history)
        setFilteredHistory([])
        return
      }
      
      // First, filter by date if a date is selected
      let dateFilteredHistory = history
      if (filterDate) {
        try {
          const selectedDate = new Date(filterDate)
          const selectedDateStr = selectedDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
          
          dateFilteredHistory = history.filter(item => {
            try {
              // Check if the item's date matches the selected date
              if (!item || !item.timestamp) return false
              const itemDate = new Date(item.timestamp)
              if (isNaN(itemDate.getTime())) return false
              
              const itemDateStr = itemDate.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })
              return itemDateStr === selectedDateStr
            } catch (e) {
              console.warn('[History] Error filtering item by date:', e, item)
              return false
            }
          })
        } catch (e) {
          console.error('[History] Error in date filtering:', e)
          dateFilteredHistory = history
        }
      }
      
      // Group by name (one entry per person - use latest entry)
      const grouped = {}
      let skippedCount = 0
      dateFilteredHistory.forEach(item => {
        try {
          if (!item) {
            skippedCount++
            console.warn('[History] ⚠️ Skipping null/undefined item')
            return
          }
          
          // Check if item has name field
          if (!item.name) {
            skippedCount++
            console.warn('[History] ⚠️ Skipping item without name:', {
              id: item.id,
              timestamp: item.timestamp,
              date: item.date,
              keys: Object.keys(item),
              item: item
            })
            return
          }
          
          if (!grouped[item.name] || (item.timestamp && grouped[item.name].timestamp && item.timestamp > grouped[item.name].timestamp)) {
            grouped[item.name] = item
          }
        } catch (e) {
          skippedCount++
          console.warn('[History] ❌ Error grouping item:', e, item)
        }
      })
      
      if (skippedCount > 0) {
        console.warn(`[History] ⚠️ Skipped ${skippedCount} items (missing name or invalid)`)
      }
      
      const groupedArray = Object.values(grouped)
      console.log('[History] 🔍 Filtered history:', {
        original: history.length,
        dateFiltered: dateFilteredHistory.length,
        grouped: groupedArray.length,
        searchName: searchName || '(empty)',
        filterDate: filterDate || '(none)'
      })
      
      // Then filter by name if searchName is provided
      if (searchName.trim() === '') {
        setFilteredHistory(groupedArray)
      } else {
        const filtered = groupedArray.filter(item => {
          try {
            if (!item || !item.name) return false
            return item.name.toLowerCase().includes(searchName.toLowerCase())
          } catch (e) {
            console.warn('[History] Error filtering item by name:', e, item)
            return false
          }
        })
        setFilteredHistory(filtered)
      }
    } catch (error) {
      console.error('[History] Error in filter effect:', error)
      setFilteredHistory([])
    }
  }, [searchName, history, filterDate])

  // Clean up duplicate boxes in saved history
  const cleanupDuplicateBoxes = async () => {
    try {
      const parsed = await loadHistory()
      if (parsed && parsed.length > 0) {
        
        // Clean up each list
        const cleaned = parsed.map(list => {
          const seenBoxes = new Set()
          const uniqueBoxes = []
          
          list.scannedList.forEach(box => {
            const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
            if (!seenBoxes.has(boxKey)) {
              seenBoxes.add(boxKey)
              uniqueBoxes.push(box)
            }
          })
          
          // Recalculate totals for cleaned list
          const totals = uniqueBoxes.reduce((acc, item) => {
            const nw = parseFloat(item.netWeight) || 0
            const gw = parseFloat(item.grossWeight) || 0
            const cones = parseInt(item.cones || item.date || '0', 10) || 0
            const lbs = nw * 2.20
            
            return {
              totalNW: acc.totalNW + nw,
              totalGW: acc.totalGW + gw,
              totalCones: acc.totalCones + cones,
              totalLbs: acc.totalLbs + lbs
            }
          }, { totalNW: 0, totalGW: 0, totalCones: 0, totalLbs: 0 })
          
          return {
            ...list,
            scannedList: uniqueBoxes,
            boxCount: uniqueBoxes.length,
            totals: {
              totalNW: totals.totalNW.toFixed(3),
              totalGW: totals.totalGW.toFixed(3),
              totalCones: totals.totalCones.toFixed(0),
              totalLbs: totals.totalLbs.toFixed(3)
            }
          }
        })
        
        await saveHistory(cleaned)
        setHistory(cleaned)
        alert('Duplicate boxes have been removed from history!')
        loadHistoryFromStorage()
      }
    } catch (error) {
      console.error('Error cleaning up duplicates:', error)
      alert('Error cleaning up duplicates: ' + error.message)
    }
  }

  // Load history from storage (with error handling)
  const loadHistoryFromStorage = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[History] 🔄 Starting to load history...')
      
      let parsed = await loadHistory()
      console.log('[History] 📦 Raw loaded data:', parsed)
      console.log('[History] 📊 History length:', parsed?.length || 0)
      
      // Ensure parsed is an array
      if (!Array.isArray(parsed)) {
        console.warn('[History] ⚠️ History is not an array, converting...', parsed)
        parsed = []
      }
      
      // Log sample items for debugging
      if (parsed && parsed.length > 0) {
        console.log('[History] 📋 Sample items (first 3):', parsed.slice(0, 3).map(item => ({
          name: item?.name,
          date: item?.date,
          timestamp: item?.timestamp,
          boxCount: item?.boxCount || item?.scannedList?.length,
          hasScannedList: !!item?.scannedList,
          keys: Object.keys(item || {})
        })))
        console.log('[History] 📋 Full first item:', parsed[0])
        console.log('[History] 📋 Items without name:', parsed.filter(item => !item?.name).length)
        console.log('[History] 📋 Items with name:', parsed.filter(item => item?.name).length)
      }
      
      // Auto-recover: If storage is empty, try Google Drive backup
      if (!parsed || parsed.length === 0) {
        console.log('[History] ⚠️ History is empty, checking Google Drive backup...')
        try {
          // Check if Google Drive is connected
          const driveAuth = await checkGoogleDriveAuth()
          if (driveAuth.isAuthenticated) {
            const driveResult = await downloadHistoryFromDrive()
            if (driveResult.success && driveResult.data && Array.isArray(driveResult.data) && driveResult.data.length > 0) {
              console.log(`[History] 🔄 Auto-recovering ${driveResult.data.length} items from Google Drive backup`)
              // Restore it to local storage
              await saveHistory(driveResult.data)
              parsed = driveResult.data
              console.log(`[History] ✅ Successfully restored ${driveResult.data.length} items from Google Drive`)
              alert(`✅ Restored ${driveResult.data.length} items from Google Drive backup!`)
            } else {
              console.log('[History] ℹ️ No Google Drive backup found or empty')
            }
          } else {
            console.log('[History] ℹ️ Google Drive not connected, skipping Drive restore')
          }
        } catch (driveError) {
          console.error('[History] ❌ Error during Google Drive restore:', driveError)
          // Fallback to localStorage if Drive restore fails
          try {
            const localBackup = localStorage.getItem('generate_list_history')
            if (localBackup) {
              const backupData = JSON.parse(localBackup)
              if (backupData && Array.isArray(backupData) && backupData.length > 0) {
                console.log(`[History] 🔄 Fallback: Recovering ${backupData.length} items from localStorage backup`)
                await saveHistory(backupData)
                parsed = backupData
                console.log(`[History] ✅ Successfully restored ${backupData.length} items from localStorage`)
              }
            }
          } catch (recoveryError) {
            console.error('[History] ❌ Error during localStorage recovery:', recoveryError)
          }
        }
      }
      
      setHistory(parsed || [])
      console.log('[History] ✅ History state set:', (parsed || []).length, 'items')
    } catch (error) {
      console.error('[History] ❌ Error loading history:', error)
      console.error('[History] Error stack:', error.stack)
      setError(error.message || 'Failed to load history')
      setHistory([])
    } finally {
      setLoading(false)
    }
  }

  // Delete a list from history
  const deleteList = async (id) => {
    if (window.confirm('Are you sure you want to delete this list from history?')) {
      try {
        await deleteHistoryItem(id)
        const updatedHistory = history.filter(item => item.id !== id)
        setHistory(updatedHistory)
        setFilteredHistory(updatedHistory.filter(item => 
          searchName.trim() === '' || 
          item.name.toLowerCase().includes(searchName.toLowerCase()) ||
          (item.displayName && item.displayName.toLowerCase().includes(searchName.toLowerCase()))
        ))
      } catch (error) {
        console.error('Error deleting list:', error)
      }
    }
  }

  // Clear all history
  const clearAllHistory = async () => {
    if (window.confirm('Are you sure you want to delete ALL history? This cannot be undone.')) {
      try {
        await clearHistory()
        setHistory([])
        setFilteredHistory([])
      } catch (error) {
        console.error('Error clearing history:', error)
      }
    }
  }

  // Format date and time
  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format date only (for box added date)
  const formatDate = (timestamp) => {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  // Load listings from storage
  const loadListingsFromStorage = async () => {
    try {
      console.log('[History] 🔄 Loading listings...')
      const loadedListings = await loadListings()
      console.log('[History] 📦 Loaded listings:', loadedListings.length)
      setListings(loadedListings || [])
    } catch (error) {
      console.error('[History] ❌ Error loading listings:', error)
      setListings([])
    }
  }

  // Connect to Google Drive
  const connectGoogleDrive = async () => {
    try {
      setGoogleDriveLoading(true)
      console.log('[History] Getting Google Drive auth URL...')
      const result = await getGoogleDriveAuthUrl()
      console.log('[History] Auth URL result:', result)
      
      if (result.success && result.authUrl) {
        // Browser will open automatically (handled in main process)
        // Show input modal for authorization code
        setShowAuthCodeInput(true)
        setAuthCodeInput('')
        setGoogleDriveLoading(false) // Stop loading so user can interact
      } else {
        const errorMsg = result.error || 'Unknown error'
        console.error('[History] Failed to get auth URL:', errorMsg)
        alert('❌ Failed to get authorization URL:\n\n' + errorMsg + '\n\nPlease check:\n1. Run "npm install" to install dependencies\n2. Check the console (F12) for detailed error messages')
        setGoogleDriveLoading(false)
      }
    } catch (error) {
      console.error('[History] Error connecting to Google Drive:', error)
      alert('❌ Error connecting to Google Drive:\n\n' + error.message + '\n\nPlease check the console (F12) for details.')
      setGoogleDriveLoading(false)
    }
  }

  // Handle authorization code submission
  const handleAuthCodeSubmit = async () => {
    if (!authCodeInput.trim()) {
      alert('⚠️ Please enter the authorization code')
      return
    }

    try {
      setGoogleDriveLoading(true)
      const authResult = await authenticateGoogleDrive(authCodeInput.trim())
      if (authResult.success) {
        setShowAuthCodeInput(false)
        setAuthCodeInput('')
        alert('✅ Successfully connected to Google Drive!\n\nYour history will now be automatically backed up to Google Drive every time you save.')
        await checkGoogleDriveStatus()
        // Also backup current history if any exists
        if (history.length > 0) {
          const uploadResult = await uploadHistoryToDrive(history)
          if (uploadResult.success) {
            console.log('[History] Current history backed up to Google Drive')
          }
        }
      } else {
        alert('❌ Failed to connect: ' + (authResult.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[History] Error authenticating:', error)
      alert('❌ Error connecting: ' + error.message)
    } finally {
      setGoogleDriveLoading(false)
    }
  }

  // Cancel authorization code input
  const handleAuthCodeCancel = () => {
    setShowAuthCodeInput(false)
    setAuthCodeInput('')
    setGoogleDriveLoading(false)
  }

  // Restore history from Google Drive
  const restoreFromGoogleDrive = async () => {
    if (!window.confirm('This will replace your current local history with the backup from Google Drive. Continue?')) {
      return
    }
    
    try {
      setGoogleDriveLoading(true)
      const result = await downloadHistoryFromDrive()
      
      if (result.success && result.data) {
        // Save restored data locally
        await saveHistory(result.data)
        // Reload history
        await loadHistoryFromStorage()
        alert(`✅ Successfully restored ${result.data.length} items from Google Drive!`)
      } else {
        alert('❌ Failed to restore: ' + (result.error || 'No backup found in Google Drive'))
      }
    } catch (error) {
      console.error('[History] Error restoring from Google Drive:', error)
      alert('❌ Error restoring from Google Drive: ' + error.message)
    } finally {
      setGoogleDriveLoading(false)
    }
  }

  // Disconnect Google Drive
  const disconnectGoogleDrive = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Drive? Your backups will remain in Drive, but automatic syncing will stop.')) {
      return
    }
    
    try {
      setGoogleDriveLoading(true)
      const result = await revokeGoogleDriveAccess()
      if (result.success) {
        setGoogleDriveConnected(false)
        alert('✅ Disconnected from Google Drive')
      } else {
        alert('❌ Failed to disconnect: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[History] Error disconnecting Google Drive:', error)
      alert('❌ Error disconnecting: ' + error.message)
    } finally {
      setGoogleDriveLoading(false)
    }
  }


  // Get all boxes for a person
  const getPersonBoxes = (personName) => {
    return history.filter(item => item.name === personName)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50 relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23fef3c7%22%20fill-opacity%3D%220.1%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 z-0 pointer-events-none"></div>

      <div className="relative z-10" style={{ position: 'relative' }}>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              📚 Data History
            </h1>
            <p className="text-lg text-gray-600">
              View and manage your saved lists and listings
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-2 shadow-xl border border-white/20 mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors duration-200 ${
                  activeTab === 'history'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📋 History ({history.length})
              </button>
              <button
                onClick={() => setActiveTab('listings')}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors duration-200 ${
                  activeTab === 'listings'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📁 Listings ({listings.length})
              </button>
            </div>
          </div>

          {/* Authorization Code Input Modal */}
          {showAuthCodeInput && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  🔐 Enter Authorization Code
                </h2>
                <div className="mb-4 text-gray-600">
                  <p className="mb-2">A browser window has opened for Google sign-in.</p>
                  <p className="mb-2"><strong>Steps:</strong></p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Sign in with your Google account (saqib.arshad.silk@gmail.com)</li>
                    <li>Click "Allow" to grant access</li>
                    <li>You will see an authorization code on the page</li>
                    <li>Copy that code and paste it below:</li>
                  </ol>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorization Code:
                  </label>
                  <input
                    type="text"
                    value={authCodeInput}
                    onChange={(e) => setAuthCodeInput(e.target.value)}
                    placeholder="Paste authorization code here..."
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAuthCodeSubmit()
                      } else if (e.key === 'Escape') {
                        handleAuthCodeCancel()
                      }
                    }}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleAuthCodeSubmit}
                    disabled={googleDriveLoading || !authCodeInput.trim()}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors duration-200"
                  >
                    {googleDriveLoading ? 'Connecting...' : '✅ Connect'}
                  </button>
                  <button
                    onClick={handleAuthCodeCancel}
                    disabled={googleDriveLoading}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Google Drive Status - Only show for history tab */}
          {activeTab === 'history' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-white/20 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-2xl ${googleDriveConnected ? 'text-green-500' : 'text-gray-400'}`}>
                  {googleDriveConnected ? '☁️' : '☁️'}
                </span>
                <div>
                  <div className="font-semibold text-gray-800">
                    Google Drive: {googleDriveConnected ? 'Connected' : 'Not Connected'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {googleDriveConnected 
                      ? 'Your history is automatically backed up to Google Drive' 
                      : 'Connect to automatically backup your history to Google Drive'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {googleDriveConnected ? (
                  <>
                    <button
                      onClick={restoreFromGoogleDrive}
                      disabled={googleDriveLoading}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
                      title="Restore history from Google Drive backup"
                    >
                      {googleDriveLoading ? 'Loading...' : '📥 Restore from Drive'}
                    </button>
                    <button
                      onClick={disconnectGoogleDrive}
                      disabled={googleDriveLoading}
                      className="px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
                      title="Disconnect Google Drive"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={connectGoogleDrive}
                    disabled={googleDriveLoading}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors duration-200 text-sm"
                    title="Connect to Google Drive for automatic backups"
                  >
                    {googleDriveLoading ? 'Connecting...' : '🔗 Connect to Google Drive'}
                  </button>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Search and Actions - Only show for history tab */}
          {activeTab === 'history' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search by Name:
                  </label>
                  <input
                    type="text"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    placeholder="Enter name to search..."
                  />
                </div>
                <div className="flex-1 w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔍 Filter by Date:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="flex-1 px-4 py-2 border-2 border-yellow-400 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white font-medium"
                      title="Select a date to filter history entries"
                    />
                    {filterDate && (
                      <button
                        onClick={() => setFilterDate('')}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors duration-200"
                        title="Clear date filter"
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                  {filterDate && (
                    <p className="text-xs text-gray-600 mt-1">
                      Showing entries for: {new Date(filterDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-600">Total Lists:</div>
                  <div className="text-2xl font-bold text-yellow-600">{filteredHistory.length}</div>
                </div>
                <div className="flex gap-2">
                  {filteredHistory.length > 0 && (
                    <>
                      <button
                        onClick={cleanupDuplicateBoxes}
                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors duration-200"
                      >
                        Cleanup Duplicates
                      </button>
                      <button
                        onClick={clearAllHistory}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors duration-200"
                      >
                        Clear All History
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* History List */}
          {activeTab === 'history' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">Loading history...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-500">
                <p className="text-lg font-bold">Error loading history</p>
                <p className="text-sm mt-2">{error}</p>
                <button
                  onClick={loadHistoryFromStorage}
                  className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  Retry
                </button>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-bold">No lists found in history.</p>
                <div className="mt-4 text-sm text-gray-600 space-y-2">
                  <p><strong>Debug Info:</strong></p>
                  <p>Raw history array length: <strong>{history.length}</strong></p>
                  <p>Filtered history length: <strong>{filteredHistory.length}</strong></p>
                  {history.length > 0 && (
                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="font-semibold text-yellow-800">⚠️ History exists but is filtered out!</p>
                      <p className="text-xs text-yellow-700 mt-2">
                        Raw history has {history.length} items but filtered result is empty.
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Check console (F12) for detailed logs.
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Sample items: {JSON.stringify(history.slice(0, 2).map(h => ({ name: h?.name, date: h?.date })), null, 2)}
                      </p>
                    </div>
                  )}
                  {searchName.trim() !== '' && (
                    <p className="text-sm mt-2 text-blue-600">💡 Try clearing the search: "{searchName}"</p>
                  )}
                  {filterDate && (
                    <p className="text-sm mt-2 text-blue-600">💡 Try clearing the date filter: {filterDate}</p>
                  )}
                  <button
                    onClick={loadHistoryFromStorage}
                    className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors duration-200"
                  >
                    🔄 Reload History
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Saved Lists (by Person)</h2>
                <div className="space-y-4">
                  {filteredHistory.map((person) => {
                    const personBoxes = getPersonBoxes(person.name)
                    
                    // Collect all boxes from all entries for this person
                    const allBoxes = personBoxes.flatMap(list => list.scannedList)
                    
                    // Calculate unique boxes count and deduplicate
                    const seenBoxes = new Set()
                    const uniqueBoxes = []
                    
                    allBoxes.forEach(box => {
                      const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
                      if (!seenBoxes.has(boxKey)) {
                        seenBoxes.add(boxKey)
                        uniqueBoxes.push(box)
                      }
                    })
                    const totalBoxes = uniqueBoxes.length
                    
                    const latestList = personBoxes.sort((a, b) => b.timestamp - a.timestamp)[0]
                    
                    // Recalculate totals from all unique boxes (already collected above)
                    const recalculatedTotals = uniqueBoxes.reduce((acc, item) => {
                      const nw = parseFloat(item.netWeight) || 0
                      const gw = parseFloat(item.grossWeight) || 0
                      const cones = parseInt(item.cones || item.date || '0', 10) || 0
                      const lbs = nw * 2.20462
                      
                      return {
                        totalNW: acc.totalNW + nw,
                        totalGW: acc.totalGW + gw,
                        totalCones: acc.totalCones + cones,
                        totalLbs: acc.totalLbs + lbs
                      }
                    }, { totalNW: 0, totalGW: 0, totalCones: 0, totalLbs: 0 })
                    
                    // Use recalculated totals (always accurate) instead of saved totals
                    const totalLBS = recalculatedTotals.totalLbs
                    
                    return (
                      <div
                        key={person.name}
                        className="bg-white rounded-lg p-6 border-2 border-gray-200 hover:border-yellow-400 transition-colors duration-200"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-xl font-bold text-gray-800">{person.name}</h3>
                              <span className="px-2 py-1 bg-yellow-400 text-black text-sm font-semibold rounded">
                                {totalBoxes} {totalBoxes === 1 ? 'Box' : 'Boxes'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                              <div>
                                <span className="font-semibold">Date:</span> {latestList.date}
                              </div>
                              <div>
                                <span className="font-semibold">Time:</span> {latestList.time}
                              </div>
                              {latestList.factoryName && (
                                <div>
                                  <span className="font-semibold">Factory:</span> {latestList.factoryName}
                                </div>
                              )}
                              {latestList.twist && (
                                <div>
                                  <span className="font-semibold">Twist:</span> {latestList.twist}
                                </div>
                              )}
                            </div>
                            {latestList.loaderName && (
                              <div className="mt-2 text-sm text-gray-600">
                                <span className="font-semibold">Loader:</span> {latestList.loaderName}
                                {latestList.loaderNumber && ` (${latestList.loaderNumber})`}
                              </div>
                            )}
                            <div className="mt-2 text-xs text-gray-500">
                              Last Updated: {formatDateTime(latestList.timestamp)}
                            </div>
                            {totalLBS !== null && (
                              <div className="mt-2 text-sm text-gray-700 font-semibold">
                                <span className="font-semibold">Total LBS:</span> {totalLBS.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedPerson(selectedPerson === person.name ? null : person.name)}
                              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors duration-200"
                            >
                              {selectedPerson === person.name ? 'Hide' : 'View'} Boxes
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete all lists for ${person.name}?`)) {
                                  personBoxes.forEach(list => deleteList(list.id))
                                }
                              }}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors duration-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        {/* Show boxes when selected */}
                        {selectedPerson === person.name && (
                          <div className="mt-4 pt-4 border-t-2 border-gray-200">
                            <h4 className="text-lg font-bold text-gray-800 mb-3">All Boxes for {person.name}</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse border border-gray-300">
                                <thead>
                                  <tr className="bg-yellow-400">
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">Box No</th>
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">G.W</th>
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">N.W</th>
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">Cones</th>
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">LBS</th>
                                    <th className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">Added Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    // Get all boxes and deduplicate them
                                    // When filtering by date, also filter boxes by their addedAt timestamp
                                    let allBoxes = personBoxes.flatMap(list => list.scannedList)
                                    
                                    // Filter boxes by date if filter is active
                                    if (filterDate) {
                                      const selectedDate = new Date(filterDate)
                                      const selectedDateStr = selectedDate.toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      })
                                      
                                      allBoxes = allBoxes.filter(box => {
                                        if (!box.addedAt) return false // Exclude boxes without timestamp
                                        const boxDate = new Date(box.addedAt)
                                        const boxDateStr = boxDate.toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric'
                                        })
                                        return boxDateStr === selectedDateStr
                                      })
                                    }
                                    
                                    const seenBoxes = new Set()
                                    const uniqueBoxes = []
                                    
                                    allBoxes.forEach(box => {
                                      const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
                                      if (!seenBoxes.has(boxKey)) {
                                        seenBoxes.add(boxKey)
                                        uniqueBoxes.push(box)
                                      }
                                    })
                                    
                                    // Calculate totals from all unique boxes
                                    const tableTotals = uniqueBoxes.reduce((acc, box) => {
                                      const nw = parseFloat(box.netWeight) || 0
                                      const gw = parseFloat(box.grossWeight) || 0
                                      const cones = parseInt(box.cones || box.date || '0', 10) || 0
                                      const lbs = nw * 2.20
                                      
                                      return {
                                        totalNW: acc.totalNW + nw,
                                        totalGW: acc.totalGW + gw,
                                        totalCones: acc.totalCones + cones,
                                        totalLbs: acc.totalLbs + lbs
                                      }
                                    }, { totalNW: 0, totalGW: 0, totalCones: 0, totalLbs: 0 })
                                    
                                    return (
                                      <>
                                        {uniqueBoxes.map((box, idx) => {
                                          const nw = parseFloat(box.netWeight) || 0
                                          const lbs = (nw * 2.20).toFixed(3)
                                          return (
                                            <tr key={idx} className="hover:bg-yellow-50">
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{box.boxNumber}</td>
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{box.grossWeight}</td>
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{box.netWeight}</td>
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{box.cones || box.date || '—'}</td>
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{lbs}</td>
                                              <td className="border border-gray-300 px-2 py-2 text-black text-sm">{formatDate(box.addedAt)}</td>
                                            </tr>
                                          )
                                        })}
                                        {/* Totals Row */}
                                        {uniqueBoxes.length > 0 && (
                                          <tr className="bg-yellow-400 font-bold">
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              TOTAL{uniqueBoxes.length}
                                            </td>
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              {tableTotals.totalGW.toFixed(3)}
                                            </td>
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              {tableTotals.totalNW.toFixed(3)}
                                            </td>
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              {tableTotals.totalCones.toFixed(0)}
                                            </td>
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              {tableTotals.totalLbs.toFixed(3)}
                                            </td>
                                            <td className="border border-gray-600 px-2 py-2 text-black text-sm font-bold">
                                              —
                                            </td>
                                          </tr>
                                        )}
                                      </>
                                    )
                                  })()}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3 text-sm text-gray-600">
                              <span className="font-semibold">Total Boxes:</span> {totalBoxes} | 
                              <span className="font-semibold ml-2">Lists Saved:</span> {personBoxes.length}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          )}

          {/* Listings Tab */}
          {activeTab === 'listings' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Saved Listings</h2>
            {listings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No listings found.</p>
                <button
                  onClick={loadListingsFromStorage}
                  className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  🔄 Reload Listings
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg p-6 border-2 border-gray-200 hover:border-yellow-400 transition-colors duration-200"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">{listing.name || 'Unnamed List'}</h3>
                        <p className="text-sm text-gray-600 mt-1">File: {listing.filename}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Date: {listing.date} | Time: {listing.time}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Boxes: <span className="font-bold">{listing.boxCount || listing.scannedList?.length || 0}</span></p>
                        {listing.totals && (
                          <p className="text-sm text-gray-600 mt-1">
                            Total NW: <span className="font-bold">{listing.totals.totalNW}</span> kg
                          </p>
                        )}
                      </div>
                    </div>
                    {listing.scannedList && listing.scannedList.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-semibold text-gray-700 mb-2">Boxes:</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse border border-gray-300 text-sm">
                            <thead>
                              <tr className="bg-yellow-400">
                                <th className="border border-gray-600 px-2 py-2 text-black font-bold">Box No</th>
                                <th className="border border-gray-600 px-2 py-2 text-black font-bold">G.W</th>
                                <th className="border border-gray-600 px-2 py-2 text-black font-bold">N.W</th>
                                <th className="border border-gray-600 px-2 py-2 text-black font-bold">Cones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {listing.scannedList.map((box, boxIdx) => (
                                <tr key={boxIdx} className="hover:bg-yellow-50">
                                  <td className="border border-gray-300 px-2 py-2 text-black">{box.boxNumber}</td>
                                  <td className="border border-gray-300 px-2 py-2 text-black">{box.grossWeight}</td>
                                  <td className="border border-gray-300 px-2 py-2 text-black">{box.netWeight}</td>
                                  <td className="border border-gray-300 px-2 py-2 text-black">{box.cones || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

        </main>
      </div>
    </div>
  )
}

export default History

