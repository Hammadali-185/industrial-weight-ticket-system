import React, { useState, useEffect, useRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { saveHistory } from '../utils/storage'

const GenerateList = () => {
  const [scannedList, setScannedList] = useState([])
  const [qrInput, setQrInput] = useState('')
  const [Name, setName] = useState(localStorage.getItem('generate_list_Name') || '')
  const [factoryName, setFactoryName] = useState(localStorage.getItem('generate_list_factoryName') || '')
  const [twist, setTwist] = useState(localStorage.getItem('generate_list_twist') || '')
  const [loaderName, setLoaderName] = useState(localStorage.getItem('generate_list_loaderName') || '')
  const [loaderNumber, setLoaderNumber] = useState(localStorage.getItem('generate_list_loaderNumber') || '')
  // Helper function to get current date (auto-updating)
  const getCurrentDate = () => {
    const now = new Date()
    return now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-')
  }
  
  // Helper function to get current time in 12-hour format with dots (no seconds)
  const getCurrentTime12Hour = () => {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const hours12 = hours % 12 || 12
    return `${hours12}.${minutes} ${ampm}`
  }
  
  // Date is now auto-updating (no state needed, just use getCurrentDate())
  // Keep listDate for backward compatibility but it will be auto-generated
  const [listDate, setListDate] = useState(() => {
    // Initial value, but will be overridden by getCurrentDate()
    return getCurrentDate()
  })

  const [listTime, setListTime] = useState(() => {
    // Start with current time (will update in real-time)
    return getCurrentTime12Hour()
  })
  const [saveStatus, setSaveStatus] = useState({ message: '', type: 'info' }) // 'info', 'success', 'error'
  const [notification, setNotification] = useState({ message: '', type: 'info', show: false }) // Non-blocking notifications
  const inputRef = useRef(null)
  const tableEndRef = useRef(null)
  const scanTimeoutRef = useRef(null)

  // Load from localStorage on mount
  useEffect(() => {
    const savedList = localStorage.getItem('generate_list_items')
    if (savedList) {
      try {
        setScannedList(JSON.parse(savedList))
      } catch (e) {
        console.error('Error loading list from localStorage:', e)
      }
    }
  }, [])

  // Save to localStorage whenever list changes
  useEffect(() => {
    localStorage.setItem('generate_list_items', JSON.stringify(scannedList))
  }, [scannedList])

  // REMOVED: Auto-save - History now saves ONLY when Print button is clicked
  // This prevents unnecessary saves and ensures history is saved only when user explicitly prints


  // Calculate totals (moved before saveListToHistory)
  const calculateTotals = () => {
    const totals = scannedList.reduce((acc, item) => {
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
      totalNW: totals.totalNW.toFixed(3),
      totalGW: totals.totalGW.toFixed(3),
      totalCones: totals.totalCones.toFixed(0),
      totalLbs: totals.totalLbs.toFixed(3)
    }
  }

  // Function to save list to history
  const saveListToHistory = async () => {
    try {
      console.log('[GenerateList] 🚀 Starting saveListToHistory...')
      console.log('[GenerateList] Name:', Name)
      console.log('[GenerateList] scannedList length:', scannedList.length)
      
      // Only save if name is provided
      if (!Name) {
        console.warn('[GenerateList] ⚠️ Cannot save: Name is empty')
        setSaveStatus({ message: '⚠️ Cannot save: Name is required', type: 'error' })
        setTimeout(() => setSaveStatus({ message: '', type: 'info' }), 3000)
        return
      }
      
      // Get existing history from file system via nativeAPI
      let existingHistory = []
      try {
        const { loadHistory } = await import('../utils/storage')
        existingHistory = await loadHistory()
        console.log(`[GenerateList] Loaded ${existingHistory.length} existing history items from file system`)
        
        // Ensure it's an array
        if (!Array.isArray(existingHistory)) {
          console.warn('[GenerateList] History is not an array, converting to array:', existingHistory)
          existingHistory = []
        }
      } catch (e) {
        console.error('[GenerateList] Error loading history from file system:', e)
        console.error('[GenerateList] Error stack:', e.stack)
        existingHistory = []
      }
      
      // Calculate totals (even if list is empty)
      const totals = calculateTotals()
      
      // Helper function to extract base name (remove numbered suffix if present)
      const getBaseName = (name) => {
        const match = name.match(/^(.+?)\s+(\d+)$/)
        return match ? match[1] : name
      }
      
      const currentBaseName = getBaseName(Name)
      
      // Find existing entries with same base name AND same twist (for merging)
      // This handles both "Name" matching "Name" and "Name" matching "Name 1", etc.
      const existingEntries = existingHistory.filter(item => {
        const itemBaseName = getBaseName(item.name)
        return itemBaseName === currentBaseName && item.twist === twist
      })
      
      let listData
      if (existingEntries.length > 0) {
        // Same name + same twist: Merge ALL existing entries into one
        // Collect all boxes from all existing entries
        const allExistingBoxes = []
        const seenBoxes = new Set()
        let latestTimestamp = 0
        let latestEntry = null
        
        existingEntries.forEach(entry => {
          // Track the most recent entry for metadata (date, time, factory, etc.)
          if (entry.timestamp > latestTimestamp) {
            latestTimestamp = entry.timestamp
            latestEntry = entry
          }
          
          // Collect unique boxes from this entry
          entry.scannedList.forEach(box => {
            const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
            if (!seenBoxes.has(boxKey)) {
              seenBoxes.add(boxKey)
              allExistingBoxes.push(box)
            }
          })
        })
        
        // Now merge with new boxes from current list
        const mergedScannedList = [...allExistingBoxes]
        
        // Add new boxes that don't already exist
        scannedList.forEach(newBox => {
          const boxKey = `${newBox.boxNumber}-${newBox.netWeight}-${newBox.grossWeight}-${newBox.cones}`
          if (!seenBoxes.has(boxKey)) {
            seenBoxes.add(boxKey)
            mergedScannedList.push(newBox)
          }
        })
        
        // IMPORTANT: Recalculate ALL totals from the complete merged list
        // This ensures totals are always accurate based on ALL combined boxes
        const mergedTotals = mergedScannedList.reduce((acc, item) => {
          const nw = parseFloat(item.netWeight) || 0
          const gw = parseFloat(item.grossWeight) || 0
          const cones = parseInt(item.cones || item.date || '0', 10) || 0
          const lbs = nw * 2.20 // Use same conversion factor as calculateTotals
          
          return {
            totalNW: acc.totalNW + nw,
            totalGW: acc.totalGW + gw,
            totalCones: acc.totalCones + cones,
            totalLbs: acc.totalLbs + lbs
          }
        }, { totalNW: 0, totalGW: 0, totalCones: 0, totalLbs: 0 })
        
        // Ensure totals are properly formatted for consistency
        const formattedTotals = {
          totalNW: mergedTotals.totalNW.toFixed(3),
          totalGW: mergedTotals.totalGW.toFixed(3),
          totalCones: mergedTotals.totalCones.toFixed(0),
          totalLbs: mergedTotals.totalLbs.toFixed(3) // Use .toFixed(3) for consistency
        }
        
        // Use the most recent entry's metadata, but update with current values if provided
        // Update ALL fields with recalculated totals from merged boxes
        listData = {
          ...latestEntry,
          factoryName: factoryName || latestEntry.factoryName || '',
          twist: twist || latestEntry.twist || '',
          loaderName: loaderName || latestEntry.loaderName || '',
          loaderNumber: loaderNumber || latestEntry.loaderNumber || '',
          date: getCurrentDate() || latestEntry.date || '',
          time: listTime || latestEntry.time || '',
          scannedList: mergedScannedList, // Complete merged list of all boxes
          totals: formattedTotals, // Recalculated totals from ALL merged boxes
          boxCount: mergedScannedList.length, // Updated box count
          timestamp: Date.now() // Update to current timestamp (most recent)
        }
        
        // Remove ALL old entries for this base name+twist combination and add the merged one
        existingHistory = existingHistory.filter(item => {
          const itemBaseName = getBaseName(item.name)
          return !(itemBaseName === currentBaseName && item.twist === twist)
        })
        existingHistory.push(listData)
      } else {
        // No existing entry with same base name + same twist
        // Check if same base name exists with different twist (need to create numbered entry)
        let maxNumber = 0
        let hasSameBaseName = false
        
        // Check all entries to find those with the same base name (with or without numbered suffix)
        existingHistory.forEach(entry => {
          const entryBaseName = getBaseName(entry.name)
          
          // Check if base names match
          if (entryBaseName === currentBaseName) {
            hasSameBaseName = true
            // Extract number suffix if present
            const entryNameMatch = entry.name.match(/^(.+?)\s+(\d+)$/)
            if (entryNameMatch) {
              const number = parseInt(entryNameMatch[2], 10)
              if (number > maxNumber) {
                maxNumber = number
              }
            } else {
              // No suffix, so this is the first one (counts as 0)
              maxNumber = 0
            }
          }
        })
        
        let finalName = Name
        if (hasSameBaseName) {
          // Same base name but different twist: add numbered suffix
          finalName = `${currentBaseName} ${maxNumber + 1}`
        }
        
        // Create new entry (either new person or same name with different twist)
        listData = {
          id: Date.now(),
          name: finalName,
          factoryName: factoryName,
          twist: twist,
          loaderName: loaderName,
          loaderNumber: loaderNumber,
          date: getCurrentDate(),
          time: listTime,
          scannedList: scannedList,
          totals: {
            totalNW: totals.totalNW,
            totalGW: totals.totalGW,
            totalCones: totals.totalCones,
            totalLbs: totals.totalLbs
          },
          boxCount: scannedList.length,
          timestamp: Date.now()
        }
        existingHistory.push(listData)
      }
      
      // Sort by timestamp (newest first)
      existingHistory.sort((a, b) => b.timestamp - a.timestamp)
      
      // Save to history.json (main history file)
      console.log('[GenerateList] 💾 Saving to history:', existingHistory.length, 'items')
      setSaveStatus({ message: `💾 Saving ${existingHistory.length} items to history...`, type: 'info' })
      
      const saveResult = await saveHistory(existingHistory)
      if (saveResult) {
        console.log('[GenerateList] ✅ Successfully saved to history')
        setSaveStatus({ message: `✅ History saved! ${existingHistory.length} items stored permanently.`, type: 'success' })
        // Clear success message after 3 seconds
        setTimeout(() => setSaveStatus({ message: '', type: 'info' }), 3000)
      } else {
        console.error('[GenerateList] ❌ Failed to save to history!')
        setSaveStatus({ message: '❌ Failed to save history! Check console for details.', type: 'error' })
        // Clear error message after 5 seconds
        setTimeout(() => setSaveStatus({ message: '', type: 'info' }), 5000)
      }
      
      // Also save individual list to listings folder
      if (listData && window.nativeAPI && window.nativeAPI.saveListFile) {
        try {
          const listFileResult = await window.nativeAPI.saveListFile(listData)
          if (listFileResult) {
            console.log('[GenerateList] Successfully saved list to listings folder')
          } else {
            console.error('[GenerateList] Failed to save list to listings folder')
          }
        } catch (listFileError) {
          console.error('[GenerateList] Error saving list file:', listFileError)
          // Don't fail the entire save if list file save fails
        }
      }
    } catch (error) {
      console.error('[GenerateList] Error saving list to history:', error)
    }
  }

  // Save part name and factory name to localStorage
  useEffect(() => {
    localStorage.setItem('generate_list_Name',Name)
  }, [Name])

  useEffect(() => {
    localStorage.setItem('generate_list_factoryName', factoryName)
  }, [factoryName])

  useEffect(() => {
    localStorage.setItem('generate_list_twist', twist)
  }, [twist])

  useEffect(() => {
    localStorage.setItem('generate_list_loaderName', loaderName)
  }, [loaderName])

  useEffect(() => {
    localStorage.setItem('generate_list_loaderNumber', loaderNumber)
  }, [loaderNumber])

  // Date is auto-updating, no need to save to localStorage
  // useEffect removed - date is always current

  // Update time in real-time every minute
  useEffect(() => {
    // Update immediately
    setListTime(getCurrentTime12Hour())
    
    // Then update every minute
    const interval = setInterval(() => {
      setListTime(getCurrentTime12Hour())
    }, 60000) // Update every 60 seconds (1 minute)
    
    return () => clearInterval(interval)
  }, []) // Only run on mount

  // Auto-focus input on mount and after each scan
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current) {
        inputRef.current.focus()
        // Also ensure the input is clickable
        inputRef.current.style.pointerEvents = 'auto'
      }
    }
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(focusInput, 100)
    
    return () => clearTimeout(timeoutId)
  }, [scannedList])
  
  // Ensure input is focusable when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.style.pointerEvents = 'auto'
    }
  }, [])

  // Auto-scroll to latest entry
  useEffect(() => {
    if (tableEndRef.current) {
      tableEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [scannedList])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }
    }
  }, [])

  // Parse QR code data
  const parseQRData = (qrText) => {
    // Handle different line endings: \r\n (Windows), \r (old Mac), \n (Unix)
    // Also handle case where it might be a single line
    const normalizedText = qrText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalizedText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    const data = {}

    lines.forEach(line => {
      // Use more flexible matching with optional spaces
      const boxNoMatch = line.match(/Box\s+No\s*:\s*(.+)/i)
      if (boxNoMatch) {
        data.boxNumber = boxNoMatch[1].trim()
      }
      
      const netWeightMatch = line.match(/N\.W\s*:\s*(.+)/i)
      if (netWeightMatch) {
        data.netWeight = netWeightMatch[1].trim().replace(/\s*kg\s*/gi, '').trim()
      }
      
      const grossWeightMatch = line.match(/G\.W\s*:\s*(.+)/i)
      if (grossWeightMatch) {
        data.grossWeight = grossWeightMatch[1].trim().replace(/\s*kg\s*/gi, '').trim()
      }
      
      const conesMatch = line.match(/Cones\s*:\s*(.+)/i)
      if (conesMatch) {
        data.cones = conesMatch[1].trim()
      }
    })

    return data
  }

  // Check if entry already exists
  const isDuplicate = (newData) => {
    return scannedList.some(item => 
      item.boxNumber === newData.boxNumber &&
      item.cones === newData.cones &&
      item.grossWeight === newData.grossWeight &&
      item.netWeight === newData.netWeight
    )
  }

  // Handle QR scan input - accumulate data and auto-process after delay
  const handleQRInput = (e) => {
    const newValue = e.target.value
    setQrInput(newValue)

    // Clear existing timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    // QR scanners send data line by line very quickly
    // Check if we've received a complete QR code (ends with Lot No:)
    const hasLotNo = /Lot\s+No\s*:/i.test(newValue)
    const lines = newValue.split(/[\r\n]+/).filter(l => l.trim().length > 0)
    
    if (hasLotNo && lines.length >= 5) {
      // We have a complete QR code (includes Lot No and enough lines)
      // Process immediately but give a tiny delay to ensure all data is in
      scanTimeoutRef.current = setTimeout(() => {
        processScan(newValue.trim())
      }, 200) // Short delay to ensure all data is captured
    } else if (newValue.length > 50 && lines.length >= 4) {
      // Enough data for a QR code even if Lot No is missing
      scanTimeoutRef.current = setTimeout(() => {
        processScan(newValue.trim())
      }, 500) // Longer delay if not complete
    } else if (newValue.length > 10) {
      // Wait for more data to come in
      scanTimeoutRef.current = setTimeout(() => {
        // Check again if we have complete data
        const finalValue = inputRef.current ? inputRef.current.value : newValue
        if (finalValue.trim()) {
          const finalLines = finalValue.split(/[\r\n]+/).filter(l => l.trim().length > 0)
          if (finalLines.length >= 5 || /Lot\s+No\s*:/i.test(finalValue)) {
            processScan(finalValue.trim())
          }
        }
      }, 600) // Wait 600ms to accumulate more data
    }
  }

  // Handle paste events - QR scanners sometimes paste all data at once
  const handlePaste = (e) => {
    // Clear timeout since paste is immediate
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }
    
    // Get pasted text from clipboard
    const pastedValue = e.clipboardData ? e.clipboardData.getData('text') : ''
    
    if (pastedValue && pastedValue.trim()) {
      // Let the paste event complete first (which updates the input value)
      setTimeout(() => {
        // Now get the full value from the input
        const fullValue = inputRef.current ? inputRef.current.value : pastedValue
        setQrInput(fullValue)
        // Process after paste completes
        setTimeout(() => {
          processScan(fullValue.trim())
        }, 100)
      }, 50)
    }
  }

  // Handle Enter key or scan completion
  const handleKeyDown = (e) => {
    // For textarea: Ctrl+Enter or Shift+Enter to process, regular Enter adds newline
    // Or process on Enter if we have complete data
    if (e.key === 'Enter') {
      const hasCompleteData = /Lot\s+No\s*:/i.test(qrInput) && qrInput.split(/[\r\n]+/).filter(l => l.trim().length > 0).length >= 5
      
      if (e.ctrlKey || e.shiftKey || hasCompleteData) {
        // Process the scan
        e.preventDefault()
        // Clear timeout since we're processing manually
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current)
        }
        if (qrInput.trim()) {
          processScan(qrInput.trim())
        }
      }
      // Otherwise, Enter naturally adds a newline in textarea
    }
  }

  // Process scanned QR data
  const processScan = (qrText) => {
    const parsedData = parseQRData(qrText)

    // Debug: Log what was parsed
    console.log('QR Code Text:', qrText)
    console.log('Parsed Data:', parsedData)

    // Validate that we got the required fields
    const missingFields = []
    if (!parsedData.boxNumber) missingFields.push('Box No')
    if (!parsedData.netWeight) missingFields.push('N.W')
    if (!parsedData.grossWeight) missingFields.push('G.W')
    if (!parsedData.cones) missingFields.push('Cones')

    if (missingFields.length > 0) {
      // Non-blocking notification instead of alert
      setNotification({
        message: `⚠️ Invalid QR code format. Missing: ${missingFields.join(', ')}`,
        type: 'error',
        show: true
      })
      // Auto-hide after 4 seconds
      setTimeout(() => setNotification({ message: '', type: 'info', show: false }), 4000)
      setQrInput('')
      return
    }

    // Check for duplicates
    if (isDuplicate(parsedData)) {
      // Non-blocking notification instead of alert
      setNotification({
        message: '⚠️ This entry already exists in the list.',
        type: 'error',
        show: true
      })
      // Auto-hide after 3 seconds
      setTimeout(() => setNotification({ message: '', type: 'info', show: false }), 3000)
      setQrInput('')
      return
    }

    // Add to list
    const newEntry = {
      id: Date.now(),
      boxNumber: parsedData.boxNumber,
      cones: parsedData.cones,
      grossWeight: parsedData.grossWeight,
      netWeight: parsedData.netWeight,
      addedAt: Date.now() // Store timestamp when box was added
    }

    setScannedList(prev => [...prev, newEntry])
    setQrInput('')
  }

  // Clear list with non-blocking confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  const clearList = () => {
    setShowClearConfirm(true)
  }
  
  const confirmClearList = () => {
    setScannedList([])
    localStorage.removeItem('generate_list_items')
    setShowClearConfirm(false)
    setNotification({
      message: '✅ List cleared successfully',
      type: 'success',
      show: true
    })
    setTimeout(() => setNotification({ message: '', type: 'info', show: false }), 2000)
  }
  
  const cancelClearList = () => {
    setShowClearConfirm(false)
  }

  // Delete a single item from the list
  const deleteItem = (itemId) => {
    setScannedList(prev => prev.filter(item => item.id !== itemId))
    setNotification({
      message: '✅ Item removed from list',
      type: 'success',
      show: true
    })
    setTimeout(() => setNotification({ message: '', type: 'info', show: false }), 2000)
  }


  // Generate unique filename with auto-numbering
  const generateUniqueFilename = (baseName) => {
    if (!baseName) {
      return 'list.pdf'
    }
    
    // Get saved filenames from localStorage
    const savedFilenames = JSON.parse(localStorage.getItem('saved_pdf_filenames') || '[]')
    
    // Clean the base name for filename (remove special characters)
    const cleanName = baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    
    // Check if base name exists
    const baseFilename = `${cleanName}.pdf`
    const nameExists = savedFilenames.includes(baseFilename)
    
    if (!nameExists) {
      // Save the filename
      savedFilenames.push(baseFilename)
      localStorage.setItem('saved_pdf_filenames', JSON.stringify(savedFilenames))
      return baseFilename
    }
    
    // Find highest number for this name
    let maxNumber = 0
    savedFilenames.forEach(filename => {
      const match = filename.match(new RegExp(`^${cleanName}(\\d+)\\.pdf$`))
      if (match) {
        const num = parseInt(match[1])
        if (num > maxNumber) {
          maxNumber = num
        }
      }
    })
    
    const uniqueFilename = `${cleanName}${maxNumber + 1}.pdf`
    savedFilenames.push(uniqueFilename)
    localStorage.setItem('saved_pdf_filenames', JSON.stringify(savedFilenames))
    
    return uniqueFilename
  }

  // Print list and save as PDF
  const printList = async () => {
    // Save list to history before printing (even if empty, as long as there's a name)
    if (Name) {
      try {
        await saveListToHistory()
        console.log('[GenerateList] History saved before printing')
      } catch (error) {
        console.error('[GenerateList] Error saving history before printing:', error)
        // Continue with printing even if save fails
      }
    }
    
    const totals = calculateTotals()
    
    // Create a temporary container for PDF generation
    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'absolute'
    tempDiv.style.left = '-9999px'
    tempDiv.style.width = '210mm'
    tempDiv.style.padding = '10mm'
    tempDiv.style.backgroundColor = 'white'
    tempDiv.style.fontFamily = 'Arial, sans-serif'
    
    // Build HTML content
    const htmlContent = `
      <div style="width: 100%; padding: 10mm; font-family: Arial, sans-serif; background: white;">
        <h1 style="text-align: center; margin: 0 0 8mm 0; font-size: 16pt; font-weight: bold; color: #000;">
          SAQIB SILK INDUSTRY - Generated List
        </h1>
        <div style="margin-bottom: 8mm; padding: 5mm; border: 1px solid #000; background-color: #f9fafb; font-size: 9pt;">
          ${(getCurrentDate() || listTime || twist) ? `<div style="display: inline-block; margin-right: 15mm;"><strong>Date:</strong> ${getCurrentDate() || ''} | <strong>Time:</strong> ${listTime || ''} | <strong>Twist:</strong> ${twist || ''}</div>` : ''}
          ${Name ? `<div style="display: inline-block; margin-right: 15mm;"><strong>Name:</strong> ${Name}</div>` : ''}
          ${factoryName ? `<div style="display: inline-block; margin-right: 15mm;"><strong>Factory Name:</strong> ${factoryName}</div>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 0; font-size: 9pt; table-layout: fixed;">
          <thead>
            <tr style="background-color: #fbbf24;">
              <th style="width: 12%; border: 1px solid #000; padding: 4mm; text-align: left; font-weight: bold; color: #000;">Box No</th>
              <th style="width: 22%; border: 1px solid #000; padding: 4mm; text-align: left; font-weight: bold; color: #000;">G.W</th>
              <th style="width: 22%; border: 1px solid #000; padding: 4mm; text-align: left; font-weight: bold; color: #000;">N.W</th>
              <th style="width: 22%; border: 1px solid #000; padding: 4mm; text-align: left; font-weight: bold; color: #000;">Cones</th>
              <th style="width: 22%; border: 1px solid #000; padding: 4mm; text-align: left; font-weight: bold; color: #000;">LBS</th>
            </tr>
          </thead>
          <tbody>
            ${scannedList.map(item => {
              const nw = parseFloat(item.netWeight) || 0
              const lbs = (nw * 2.20).toFixed(3)
              return `
                <tr>
                  <td style="border: 1px solid #000; padding: 4mm; font-size: 8pt;">${item.boxNumber}</td>
                  <td style="border: 1px solid #000; padding: 4mm; font-size: 8pt;">${item.grossWeight}</td>
                  <td style="border: 1px solid #000; padding: 4mm; font-size: 8pt;">${item.netWeight}</td>
                  <td style="border: 1px solid #000; padding: 4mm; font-size: 8pt;">${item.cones || item.date || ''}</td>
                  <td style="border: 1px solid #000; padding: 4mm; font-size: 8pt;">${lbs}</td>
                </tr>
              `
            }).join('')}
            ${scannedList.length > 0 ? `
              <tr style="background-color: #fbbf24 !important; font-weight: bold; font-size: 10pt;">
                <td style="border: 1px solid #000; padding: 4mm; font-size: 10pt;"><strong>TOTAL${scannedList.length}</strong></td>
                <td style="border: 1px solid #000; padding: 4mm; font-size: 10pt;"><strong>${totals.totalGW}</strong></td>
                <td style="border: 1px solid #000; padding: 4mm; font-size: 10pt;"><strong>${totals.totalNW}</strong></td>
                <td style="border: 1px solid #000; padding: 4mm; font-size: 10pt;"><strong>${totals.totalCones}</strong></td>
                <td style="border: 1px solid #000; padding: 4mm; font-size: 10pt;"><strong>${totals.totalLbs}</strong></td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        <div style="margin-top: 8mm; text-align: center; font-size: 8pt; color: #666;">
          Total Entries: ${scannedList.length}
          ${loaderName ? ` | Loader Name: ${loaderName}` : ''}
          ${loaderNumber ? ` | Loader Number: ${loaderNumber}` : ''}
        </div>
      </div>
    `
    
    tempDiv.innerHTML = htmlContent
    document.body.appendChild(tempDiv)
    
    try {
      // Generate canvas from HTML
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      })
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgData = canvas.toDataURL('image/png')
      const imgWidth = 210 // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      
      // Generate unique filename
      const filename = generateUniqueFilename(Name)
      
      // Save PDF
      pdf.save(filename)
      
      // Clean up
      document.body.removeChild(tempDiv)
      
      // Also open print dialog for user to print if needed
      const printWindow = window.open('', '_blank')
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Generated List - Saqib Silk Industry</title>
            <style>
              @page {
                size: A4;
                margin: 15mm;
              }
              * {
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background: white;
                font-size: 10pt;
                width: 210mm;
                min-height: 297mm;
              }
              .container {
                width: 100%;
                padding: 10mm;
                page-break-inside: avoid;
              }
              h1 {
                text-align: center;
                margin: 0 0 8mm 0;
                font-size: 16pt;
                font-weight: bold;
                color: #000;
              }
              .info-box {
                margin-bottom: 8mm;
                padding: 5mm;
                border: 1px solid #000;
                background-color: #f9fafb;
                font-size: 9pt;
                page-break-inside: avoid;
              }
              .info-box div {
                display: inline-block;
                margin-right: 15mm;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 0;
                font-size: 9pt;
                table-layout: fixed;
              }
              th, td {
                border: 1px solid #000;
                padding: 4mm;
                text-align: left;
                word-wrap: break-word;
              }
              th {
                background-color: #fbbf24;
                font-weight: bold;
                color: #000;
                font-size: 9pt;
              }
              td {
                font-size: 8pt;
              }
              tr:nth-child(even) {
                background-color: #f9fafb;
              }
              .total-row {
                background-color: #fbbf24 !important;
                font-weight: bold;
                font-size: 10pt;
              }
              .total-row td {
                font-size: 10pt;
              }
              .footer {
                margin-top: 8mm;
                text-align: center;
                font-size: 8pt;
                color: #666;
                page-break-inside: avoid;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                  width: 210mm;
                }
                .container {
                  width: 100%;
                  padding: 10mm;
                }
                table {
                  page-break-inside: auto;
                }
                tr {
                  page-break-inside: avoid;
                  page-break-after: auto;
                }
                thead {
                  display: table-header-group;
                }
                tfoot {
                  display: table-footer-group;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>SAQIB SILK INDUSTRY - Generated List</h1>
              <div class="info-box">
                ${(getCurrentDate() || listTime || twist) ? `<div><strong>Date:</strong> ${getCurrentDate() || ''} | <strong>Time:</strong> ${listTime || ''} | <strong>Twist:</strong> ${twist || ''}</div>` : ''}
                ${Name ? `<div><strong>Name:</strong> ${Name}</div>` : ''}
                ${factoryName ? `<div><strong>Factory Name:</strong> ${factoryName}</div>` : ''}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 12%;">Box No</th>
                    <th style="width: 22%;">G.W</th>
                    <th style="width: 22%;">N.W</th>
                    <th style="width: 22%;">Cones</th>
                    <th style="width: 22%;">LBS</th>
                  </tr>
                </thead>
                <tbody>
                  ${scannedList.map(item => {
                    const nw = parseFloat(item.netWeight) || 0
                    const lbs = (nw * 2.20).toFixed(3)
                    return `
                      <tr>
                        <td>${item.boxNumber}</td>
                        <td>${item.grossWeight}</td>
                        <td>${item.netWeight}</td>
                        <td>${item.cones || item.date || ''}</td>
                        <td>${lbs}</td>
                      </tr>
                    `
                  }).join('')}
                  ${scannedList.length > 0 ? `
                    <tr class="total-row">
                      <td><strong>TOTAL${scannedList.length}</strong></td>
                      <td><strong>${totals.totalGW}</strong></td>
                      <td><strong>${totals.totalNW}</strong></td>
                      <td><strong>${totals.totalCones}</strong></td>
                      <td><strong>${totals.totalLbs}</strong></td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
              <div class="footer">
                Total Entries: ${scannedList.length}
                ${loaderName ? ` | Loader Name: ${loaderName}` : ''}
                ${loaderNumber ? ` | Loader Number: ${loaderNumber}` : ''}
              </div>
            </div>
          </body>
        </html>
      `)
      
      printWindow.document.close()
      
      // Wait a moment then print
      setTimeout(() => {
        printWindow.print()
      }, 250)
      
    } catch (error) {
      console.error('Error generating PDF:', error)
      // Non-blocking notification instead of alert
      setNotification({
        message: `❌ Error generating PDF: ${error.message}`,
        type: 'error',
        show: true
      })
      setTimeout(() => setNotification({ message: '', type: 'info', show: false }), 5000)
      document.body.removeChild(tempDiv)
      
      // Fallback to regular print
      const printWindow = window.open('', '_blank')
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Generated List - Saqib Silk Industry</title>
            <style>
              @page {
                size: A4;
                margin: 15mm;
              }
              * {
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background: white;
                font-size: 10pt;
                width: 210mm;
                min-height: 297mm;
              }
              .container {
                width: 100%;
                padding: 10mm;
                page-break-inside: avoid;
              }
              h1 {
                text-align: center;
                margin: 0 0 8mm 0;
                font-size: 16pt;
                font-weight: bold;
                color: #000;
              }
              .info-box {
                margin-bottom: 8mm;
                padding: 5mm;
                border: 1px solid #000;
                background-color: #f9fafb;
                font-size: 9pt;
                page-break-inside: avoid;
              }
              .info-box div {
                display: inline-block;
                margin-right: 15mm;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 0;
                font-size: 9pt;
                table-layout: fixed;
              }
              th, td {
                border: 1px solid #000;
                padding: 4mm;
                text-align: left;
                word-wrap: break-word;
              }
              th {
                background-color: #fbbf24;
                font-weight: bold;
                color: #000;
                font-size: 9pt;
              }
              td {
                font-size: 8pt;
              }
              tr:nth-child(even) {
                background-color: #f9fafb;
              }
              .total-row {
                background-color: #fbbf24 !important;
                font-weight: bold;
                font-size: 10pt;
              }
              .total-row td {
                font-size: 10pt;
              }
              .footer {
                margin-top: 8mm;
                text-align: center;
                font-size: 8pt;
                color: #666;
                page-break-inside: avoid;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                  width: 210mm;
                }
                .container {
                  width: 100%;
                  padding: 10mm;
                }
                table {
                  page-break-inside: auto;
                }
                tr {
                  page-break-inside: avoid;
                  page-break-after: auto;
                }
                thead {
                  display: table-header-group;
                }
                tfoot {
                  display: table-footer-group;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>SAQIB SILK INDUSTRY - Generated List</h1>
              <div class="info-box">
                ${(getCurrentDate() || listTime || twist) ? `<div><strong>Date:</strong> ${getCurrentDate() || ''} | <strong>Time:</strong> ${listTime || ''} | <strong>Twist:</strong> ${twist || ''}</div>` : ''}
                ${Name ? `<div><strong>Name:</strong> ${Name}</div>` : ''}
                ${factoryName ? `<div><strong>Factory Name:</strong> ${factoryName}</div>` : ''}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 12%;">Box No</th>
                    <th style="width: 22%;">G.W</th>
                    <th style="width: 22%;">N.W</th>
                    <th style="width: 22%;">Cones</th>
                    <th style="width: 22%;">LBS</th>
                  </tr>
                </thead>
                <tbody>
                  ${scannedList.map(item => {
                    const nw = parseFloat(item.netWeight) || 0
                    const lbs = (nw * 2.20).toFixed(3)
                    return `
                      <tr>
                        <td>${item.boxNumber}</td>
                        <td>${item.grossWeight}</td>
                        <td>${item.netWeight}</td>
                        <td>${item.cones || item.date || ''}</td>
                        <td>${lbs}</td>
                      </tr>
                    `
                  }).join('')}
                  ${scannedList.length > 0 ? `
                    <tr class="total-row">
                      <td><strong>TOTAL${scannedList.length}</strong></td>
                      <td><strong>${totals.totalGW}</strong></td>
                      <td><strong>${totals.totalNW}</strong></td>
                      <td><strong>${totals.totalCones}</strong></td>
                      <td><strong>${totals.totalLbs}</strong></td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
              <div class="footer">
                Total Entries: ${scannedList.length}
                ${loaderName ? ` | Loader Name: ${loaderName}` : ''}
                ${loaderNumber ? ` | Loader Number: ${loaderNumber}` : ''}
              </div>
            </div>
          </body>
        </html>
      `)
      
      printWindow.document.close()
      
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50 relative">
      {/* Save Status Indicator - Shows on screen */}
      {saveStatus.message && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-xl border-2 max-w-md ${
          saveStatus.type === 'success' 
            ? 'bg-green-100 border-green-500 text-green-800' 
            : saveStatus.type === 'error'
            ? 'bg-red-100 border-red-500 text-red-800'
            : 'bg-blue-100 border-blue-500 text-blue-800'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{saveStatus.type === 'success' ? '✅' : saveStatus.type === 'error' ? '❌' : '💾'}</span>
            <div>
              <p className="font-bold text-sm">{saveStatus.message}</p>
              <p className="text-xs mt-1 opacity-75">
                {saveStatus.type === 'success' 
                  ? 'Saved to app data directory' 
                  : saveStatus.type === 'error'
                  ? 'Check console (F12) for details'
                  : 'Saving to permanent storage...'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Non-blocking Notification - Shows errors/warnings without blocking UI */}
      {notification.show && (
        <div className={`fixed top-20 right-4 z-50 px-6 py-4 rounded-lg shadow-xl border-2 max-w-md ${
          notification.type === 'success' 
            ? 'bg-green-100 border-green-500 text-green-800' 
            : notification.type === 'error'
            ? 'bg-red-100 border-red-500 text-red-800'
            : 'bg-yellow-100 border-yellow-500 text-yellow-800'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <div className="flex-1">
              <p className="font-bold text-sm">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification({ message: '', type: 'info', show: false })}
              className="text-gray-600 hover:text-gray-800 font-bold text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* Non-blocking Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl border-2 border-gray-300 p-6 max-w-md mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Clear List?</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to clear the entire list? This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelClearList}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearList}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                Clear List
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23fef3c7%22%20fill-opacity%3D%220.1%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 z-0 pointer-events-none"></div>
      
      <div className="relative z-10" style={{ position: 'relative' }}>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              📋 Generate List
            </h1>
            <p className="text-lg text-gray-600">
              Scan QR codes to generate a list of tickets
            </p>
          </div>

          {/* List Information Section */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 mb-8 relative" style={{ zIndex: 100, position: 'relative' }}>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">List Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4" style={{ position: 'relative', zIndex: 101 }}>
              <div style={{ position: 'relative', zIndex: 102 }}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date (Auto)
                </label>
                <input
                  type="text"
                  value={getCurrentDate()}
                  disabled
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-600 mb-2"
                  placeholder="DD-MM-YYYY"
                  title="Date updates automatically"
                />
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-2">
                  Time
                </label>
                <input
                  type="text"
                  value={listTime}
                  readOnly
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-default mb-2"
                  placeholder="Auto-updating time"
                  title="Time updates automatically in real-time"
                />
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-2">
                  Twist
                </label>
                <input
                  type="text"
                  value={twist}
                  onChange={(e) => setTwist(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  placeholder="Enter twist"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={Name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Factory Name
                </label>
                <input
                  type="text"
                  value={factoryName}
                  onChange={(e) => setFactoryName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  placeholder="Enter factory name"
                />
              </div>
            </div>
          </div>

          {/* QR Input Section */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20 mb-8 relative" style={{ zIndex: 100, position: 'relative' }}>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">QR Scanner Input</h2>
            <div className="flex space-x-4 relative" style={{ zIndex: 101, position: 'relative' }}>
              <textarea
                ref={inputRef}
                value={qrInput}
                onChange={handleQRInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const target = e.target
                  setTimeout(() => target.focus(), 0)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  e.target.focus()
                }}
                onFocus={(e) => {
                  e.target.style.pointerEvents = 'auto'
                  e.target.style.zIndex = '999'
                }}
                onMouseEnter={(e) => {
                  e.target.style.pointerEvents = 'auto'
                  e.target.style.cursor = 'text'
                }}
                placeholder="Scan QR code here... (Auto-processes when complete, or Ctrl+Enter to process manually)"
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-lg min-h-[60px] resize-none cursor-text"
                autoFocus
                rows={3}
                tabIndex={0}
                readOnly={false}
                disabled={false}
                style={{ pointerEvents: 'auto', zIndex: 999, position: 'relative', cursor: 'text' }}
              />
              <button
                onClick={() => {
                  if (qrInput.trim()) {
                    processScan(qrInput.trim())
                  }
                }}
                disabled={!qrInput.trim()}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition-colors duration-200"
              >
                Add Manually
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              💡 The QR scanner will automatically send data when you scan. Press Enter or click "Add Manually" to process.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 mb-6">
            <button
              onClick={printList}
              disabled={scannedList.length === 0}
              className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition-colors duration-200 shadow-lg"
            >
              🖨️ Print List
            </button>
            <button
              onClick={clearList}
              disabled={scannedList.length === 0}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition-colors duration-200 shadow-lg"
            >
              🗑️ Clear List
            </button>
            <div className="flex-1 flex items-center justify-end gap-4">
              <span className="text-lg font-semibold text-gray-700">
                Total Entries: <span className="text-yellow-600">{scannedList.length}</span>
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Loader Name:</label>
                <input
                  type="text"
                  value={loaderName}
                  onChange={(e) => setLoaderName(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent w-40"
                  placeholder="Enter loader name"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Loader Number:</label>
                <input
                  type="text"
                  value={loaderNumber}
                  onChange={(e) => setLoaderNumber(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent w-40"
                  placeholder="Enter loader number"
                />
              </div>
            </div>
          </div>

          {/* Table Display */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            <div className="mb-4 pb-4 border-b-2 border-gray-300">
              <div className="flex flex-wrap items-center gap-4">
                {(getCurrentDate() || listTime || twist) && (
                  <div className="flex flex-col gap-1">
                    {getCurrentDate() && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-700">Date:</span>
                        <span className="text-lg font-bold text-gray-900">{getCurrentDate()}</span>
                      </div>
                    )}
                    {listTime && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-700">Time:</span>
                        <span className="text-lg font-bold text-gray-900">{listTime}</span>
                      </div>
                    )}
                    {twist && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-700">Twist:</span>
                        <span className="text-lg font-bold text-gray-900">{twist}</span>
                      </div>
                    )}
                  </div>
                )}
                {Name && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-700">Name:</span>
                    <span className="text-lg font-bold text-gray-900">{Name}</span>
                  </div>
                )}
                {factoryName && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-700">Factory Name:</span>
                    <span className="text-lg font-bold text-gray-900">{factoryName}</span>
                  </div>
                )}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Scanned List</h2>
            
            {scannedList.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No entries yet. Start scanning QR codes to build your list.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-yellow-400">
                      <th className="border border-gray-600 px-2 py-3 text-left font-bold text-black w-24">Box No</th>
                      <th className="border border-gray-600 px-4 py-3 text-left font-bold text-black">G.W</th>
                      <th className="border border-gray-600 px-4 py-3 text-left font-bold text-black">N.W</th>
                      <th className="border border-gray-600 px-4 py-3 text-left font-bold text-black">Cones</th>
                      <th className="border border-gray-600 px-4 py-3 text-left font-bold text-black">LBS</th>
                      <th className="border border-gray-600 px-2 py-3 text-center font-bold text-black w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedList.map((item, index) => {
                      const nw = parseFloat(item.netWeight) || 0
                      const lbs = (nw * 2.2046).toFixed(3)
                      return (
                        <tr 
                          key={item.id} 
                          className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        >
                          <td className="border border-gray-300 px-2 py-3 w-24">{item.boxNumber}</td>
                          <td className="border border-gray-300 px-4 py-3">{item.grossWeight}</td>
                          <td className="border border-gray-300 px-4 py-3">{item.netWeight}</td>
                          <td className="border border-gray-300 px-4 py-3">{item.cones || item.date || '—'}</td>
                          <td className="border border-gray-300 px-4 py-3">{lbs}</td>
                          <td className="border border-gray-300 px-2 py-3 text-center w-20">
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded transition-colors duration-200 text-sm"
                              title="Remove this item"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {scannedList.length > 0 && (
                      <tr className="bg-yellow-400 font-bold">
                        <td className="border border-gray-600 px-2 py-3 text-black text-lg">TOTAL{scannedList.length}</td>
                        <td className="border border-gray-600 px-4 py-3 text-black text-lg">{calculateTotals().totalGW}</td>
                        <td className="border border-gray-600 px-4 py-3 text-black text-lg">{calculateTotals().totalNW}</td>
                        <td className="border border-gray-600 px-4 py-3 text-black text-lg">{calculateTotals().totalCones}</td>
                        <td className="border border-gray-600 px-4 py-3 text-black text-lg">{calculateTotals().totalLbs}</td>
                        <td className="border border-gray-600 px-2 py-3"></td>
                      </tr>
                    )}
                    <tr ref={tableEndRef}></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default GenerateList

