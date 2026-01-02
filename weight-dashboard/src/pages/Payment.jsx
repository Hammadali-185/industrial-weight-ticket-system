import React, { useState, useEffect } from 'react'
import { loadHistory, savePayments, loadPayments } from '../utils/storage'

const Payment = () => {
  const [history, setHistory] = useState([])
  const [searchName, setSearchName] = useState('')
  const [filteredHistory, setFilteredHistory] = useState([])
  const [multipliers, setMultipliers] = useState({}) // Store multiplier values for each person
  const [savedPayments, setSavedPayments] = useState({}) // Store saved payment calculations
  const [editingPayments, setEditingPayments] = useState({}) // Track which payments are in edit mode
  const [receivedAmounts, setReceivedAmounts] = useState({}) // Store received amounts for each person
  const [paymentMethods, setPaymentMethods] = useState({}) // Store payment methods (cash/account) for each person
  const [cashLocations, setCashLocations] = useState({}) // Store cash location/place for each person

  // Load history from IndexedDB on mount
  useEffect(() => {
    loadHistoryFromStorage()
  }, [])

  // Filter history when searchName changes
  useEffect(() => {
    // Group by name (one entry per person - use latest entry)
    const grouped = {}
    history.forEach(item => {
      if (!grouped[item.name] || item.timestamp > grouped[item.name].timestamp) {
        grouped[item.name] = item
      }
    })
    
    const groupedArray = Object.values(grouped)
    
    if (searchName.trim() === '') {
      setFilteredHistory(groupedArray)
    } else {
      const filtered = groupedArray.filter(item => 
        item.name.toLowerCase().includes(searchName.toLowerCase())
      )
      setFilteredHistory(filtered)
    }
  }, [searchName, history])

  // Load history from IndexedDB (with localStorage fallback)
  const loadHistoryFromStorage = async () => {
    try {
      const parsed = await loadHistory()
      setHistory(parsed || [])
    } catch (error) {
      console.error('Error loading history:', error)
      setHistory([])
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

  // Format date and time for payment (shorter format)
  const formatPaymentDateTime = (timestamp) => {
    const date = new Date(timestamp)
    const dateStr = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const timeStr = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    return `${dateStr}, ${timeStr}`
  }

  // Get all boxes for a person
  const getPersonBoxes = (personName) => {
    return history.filter(item => item.name === personName)
  }

  // Handle multiplier input change
  const handleMultiplierChange = (personName, value) => {
    // Allow empty string (user can clear the input completely)
    if (value === '' || value === null || value === undefined) {
      setMultipliers(prev => ({
        ...prev,
        [personName]: ''
      }))
      return
    }
    
    // Only allow numeric values (integers or decimals)
    const numericValue = value.replace(/[^0-9.]/g, '')
    
    // If after filtering there's nothing left, allow empty string
    if (numericValue === '') {
      setMultipliers(prev => ({
        ...prev,
        [personName]: ''
      }))
      return
    }
    
    // Prevent multiple decimal points
    const parts = numericValue.split('.')
    const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue
    
    setMultipliers(prev => ({
      ...prev,
      [personName]: formattedValue
    }))
  }

  // Calculate result (Total LBS × multiplier) - return as integer (no decimals)
  const calculateResult = (totalLBS, multiplier) => {
    if (!multiplier || multiplier === '' || isNaN(parseFloat(multiplier))) {
      return null
    }
    const result = totalLBS * parseFloat(multiplier)
    return Math.round(result) // Return as integer (rounded, no decimals)
  }

  // Save payment calculation - uses persistent storage (IndexedDB/File System)
  const savePayment = async (personName, totalLBS, multiplier, calculatedResult) => {
    const receivedAmount = receivedAmounts[personName] || 0
    const paymentMethod = paymentMethods[personName] || 'cash'
    const cashLocation = cashLocations[personName] || ''
    const updatedPayments = {
      ...savedPayments,
      [personName]: {
        totalLBS: totalLBS,
        multiplier: multiplier,
        result: calculatedResult,
        received: receivedAmount,
        remaining: calculatedResult - receivedAmount,
        paymentMethod: paymentMethod,
        cashLocation: cashLocation,
        timestamp: Date.now()
      }
    }
    
    setSavedPayments(updatedPayments)
    
    // Exit edit mode after saving
    setEditingPayments(prev => {
      const updated = { ...prev }
      delete updated[personName]
      return updated
    })
    
    // Save to persistent storage (IndexedDB/File System) - will persist permanently
    try {
      await savePayments(updatedPayments)
    } catch (e) {
      console.error('Error saving payment:', e)
    }
  }

  // Handle payment method change
  const handlePaymentMethodChange = (personName, method) => {
    setPaymentMethods(prev => ({
      ...prev,
      [personName]: method
    }))
    
    // If switching to account, clear cash location
    if (method === 'account') {
      setCashLocations(prev => {
        const updated = { ...prev }
        delete updated[personName]
        return updated
      })
    }
  }

  // Handle cash location change
  const handleCashLocationChange = (personName, value) => {
    setCashLocations(prev => ({
      ...prev,
      [personName]: value
    }))
  }

  // Handle received amount change
  const handleReceivedChange = (personName, value) => {
    // Allow empty string (user can clear the input completely)
    if (value === '' || value === null || value === undefined) {
      setReceivedAmounts(prev => ({
        ...prev,
        [personName]: ''
      }))
      return
    }
    
    // Only allow numeric values (integers or decimals)
    const numericValue = value.replace(/[^0-9.]/g, '')
    
    // If after filtering there's nothing left, allow empty string
    if (numericValue === '') {
      setReceivedAmounts(prev => ({
        ...prev,
        [personName]: ''
      }))
      return
    }
    
    // Prevent multiple decimal points
    const parts = numericValue.split('.')
    const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue
    
    setReceivedAmounts(prev => ({
      ...prev,
      [personName]: formattedValue
    }))
  }

  // Handle edit button click - enable edit mode
  const handleEdit = (personName) => {
    setEditingPayments(prev => ({
      ...prev,
      [personName]: true
    }))
  }

  // Check if payment is in edit mode
  const isEditing = (personName) => {
    return editingPayments[personName] === true
  }

  // Load saved payments from persistent storage on mount
  useEffect(() => {
    const loadSavedPayments = async () => {
      try {
        const saved = await loadPayments()
        if (saved && Object.keys(saved).length > 0) {
          setSavedPayments(saved)
          
          // Also restore multiplier values, received amounts, payment methods, and cash locations from saved payments
          const restoredMultipliers = {}
          const restoredReceived = {}
          const restoredPaymentMethods = {}
          const restoredCashLocations = {}
          Object.keys(saved).forEach(personName => {
            if (saved[personName].multiplier !== undefined && saved[personName].multiplier !== null) {
              restoredMultipliers[personName] = saved[personName].multiplier.toString()
            }
            if (saved[personName].received !== undefined && saved[personName].received !== null) {
              restoredReceived[personName] = saved[personName].received.toString()
            }
            if (saved[personName].paymentMethod !== undefined && saved[personName].paymentMethod !== null) {
              restoredPaymentMethods[personName] = saved[personName].paymentMethod
            }
            if (saved[personName].cashLocation !== undefined && saved[personName].cashLocation !== null) {
              restoredCashLocations[personName] = saved[personName].cashLocation
            }
          })
          if (Object.keys(restoredMultipliers).length > 0) {
            setMultipliers(restoredMultipliers)
          }
          if (Object.keys(restoredReceived).length > 0) {
            setReceivedAmounts(restoredReceived)
          }
          if (Object.keys(restoredPaymentMethods).length > 0) {
            setPaymentMethods(restoredPaymentMethods)
          }
          if (Object.keys(restoredCashLocations).length > 0) {
            setCashLocations(restoredCashLocations)
          }
        } else {
          setSavedPayments({})
        }
      } catch (e) {
        console.error('Error loading saved payments:', e)
        setSavedPayments({})
      }
    }
    
    loadSavedPayments()
  }, [])

  // Check if payment is saved for a person
  const isPaymentSaved = (personName) => {
    return savedPayments[personName] !== undefined
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
              💰 Payment Calculator
            </h1>
            <p className="text-lg text-gray-600">
              Calculate payments based on total weight and rate
            </p>
          </div>

          {/* Search and Actions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
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
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-600">Total Lists:</div>
                  <div className="text-2xl font-bold text-yellow-600">{filteredHistory.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment List */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No lists found in history.</p>
                {searchName.trim() !== '' && (
                  <p className="text-sm mt-2">Try a different search term or clear the search.</p>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Payment Calculations (by Person)</h2>
                <div className="space-y-4">
                  {filteredHistory.map((person) => {
                    const personBoxes = getPersonBoxes(person.name)
                    
                    // Calculate actual unique boxes count
                    const allBoxes = personBoxes.flatMap(list => list.scannedList)
                    const seenBoxes = new Set()
                    allBoxes.forEach(box => {
                      const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
                      if (!seenBoxes.has(boxKey)) {
                        seenBoxes.add(boxKey)
                      }
                    })
                    const totalBoxes = seenBoxes.size
                    
                    const latestList = personBoxes.sort((a, b) => b.timestamp - a.timestamp)[0]
                    
                    // Calculate Total LBS - use saved totalLbs if available, otherwise calculate from boxes
                    let totalLBS = null
                    if (latestList.totals && latestList.totals.totalLbs) {
                      // Use saved totalLbs from storage
                      totalLBS = parseFloat(latestList.totals.totalLbs)
                    } else {
                      // Calculate from all unique boxes (netWeight * 2.20462)
                      const allBoxes = personBoxes.flatMap(list => list.scannedList)
                      const seenBoxes = new Set()
                      const uniqueBoxes = []
                      
                      allBoxes.forEach(box => {
                        const boxKey = `${box.boxNumber}-${box.netWeight}-${box.grossWeight}-${box.cones}`
                        if (!seenBoxes.has(boxKey)) {
                          seenBoxes.add(boxKey)
                          uniqueBoxes.push(box)
                        }
                      })
                      
                      totalLBS = uniqueBoxes.reduce((sum, box) => {
                        const nw = parseFloat(box.netWeight) || 0
                        return sum + (nw * 2.20462)
                      }, 0)
                    }
                    
                    // Get multiplier from state or from saved payment
                    // Only use saved payment if multiplier is not explicitly set in state (including empty string)
                    const savedPayment = savedPayments[person.name]
                    const multiplier = multipliers.hasOwnProperty(person.name) 
                      ? multipliers[person.name] 
                      : (savedPayment?.multiplier?.toString() || '')
                    const calculatedResult = totalLBS !== null ? calculateResult(totalLBS, multiplier) : null
                    
                    // Get received amount from state or from saved payment
                    const receivedAmount = receivedAmounts.hasOwnProperty(person.name)
                      ? receivedAmounts[person.name]
                      : (savedPayment?.received?.toString() || '')
                    const receivedValue = receivedAmount ? parseFloat(receivedAmount) || 0 : 0
                    const remainingValue = calculatedResult !== null ? Math.max(0, Math.round(calculatedResult) - Math.round(receivedValue)) : null
                    
                    // Get payment method from state or from saved payment (default to cash)
                    const paymentMethod = paymentMethods.hasOwnProperty(person.name)
                      ? paymentMethods[person.name]
                      : (savedPayment?.paymentMethod || 'cash')
                    
                    // Get cash location from state or from saved payment
                    const cashLocation = cashLocations.hasOwnProperty(person.name)
                      ? cashLocations[person.name]
                      : (savedPayment?.cashLocation || '')
                    
                    return (
                      <div
                        key={person.name}
                        className="bg-white rounded-lg p-6 border-2 border-gray-200 hover:border-yellow-400 transition-colors duration-200"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
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
                            <div className="mt-2 text-xs text-gray-500">
                              Last Updated: {formatDateTime(latestList.timestamp)}
                            </div>
                            {totalLBS !== null && (
                              <div className="mt-2 space-y-1">
                                <div className="text-sm text-gray-700 font-semibold flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">Total LBS:</span>
                                  <span>{totalLBS.toFixed(2)}</span>
                                  <span className="mx-1">×</span>
                                  <input
                                    type="text"
                                    value={multiplier}
                                    onChange={(e) => handleMultiplierChange(person.name, e.target.value)}
                                    placeholder="Enter rate"
                                    disabled={isPaymentSaved(person.name) && !isEditing(person.name)}
                                    className={`w-20 px-2 py-1 border-2 rounded-lg text-center ${
                                      isPaymentSaved(person.name) && !isEditing(person.name)
                                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                                        : 'border-gray-300 focus:ring-2 focus:ring-yellow-400 focus:border-transparent'
                                    }`}
                                    style={{ minWidth: '60px' }}
                                  />
                                  {calculatedResult !== null && (
                                    <>
                                      <span className="mx-1">=</span>
                                      <span className="text-yellow-600 font-bold text-lg">{calculatedResult.toLocaleString()}</span>
                                      <span className="text-yellow-600 font-bold text-lg">Rs</span>
                                      {isPaymentSaved(person.name) && !isEditing(person.name) ? (
                                        <button
                                          onClick={() => handleEdit(person.name)}
                                          className="ml-2 px-3 py-1 rounded-lg text-sm font-semibold transition-colors duration-200 bg-yellow-500 hover:bg-yellow-600 text-white"
                                        >
                                          Edit
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => savePayment(person.name, totalLBS, multiplier, calculatedResult)}
                                          className={`ml-2 px-3 py-1 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                                            isPaymentSaved(person.name)
                                              ? 'bg-green-500 hover:bg-green-600 text-white'
                                              : 'bg-blue-500 hover:bg-blue-600 text-white'
                                          }`}
                                        >
                                          {isPaymentSaved(person.name) ? 'Save' : 'Save'}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                                {isPaymentSaved(person.name) && savedPayments[person.name]?.timestamp && (
                                  <div className="text-xs text-gray-500">
                                    Last Updated: {formatPaymentDateTime(savedPayments[person.name].timestamp)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Payment Tracking Section - Right Side */}
                          {calculatedResult !== null && (
                            <div className="flex-1 md:max-w-xs bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                              <h4 className="text-lg font-bold text-gray-800 mb-3">Payment Details</h4>
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Total
                                  </label>
                                  <div className="text-xl font-bold text-yellow-600">
                                    {Math.round(calculatedResult).toLocaleString()} Rs
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Received
                                  </label>
                                  <input
                                    type="text"
                                    value={receivedAmount}
                                    onChange={(e) => handleReceivedChange(person.name, e.target.value)}
                                    placeholder="Enter received amount"
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-center"
                                    disabled={isPaymentSaved(person.name) && !isEditing(person.name)}
                                    style={{
                                      ...(isPaymentSaved(person.name) && !isEditing(person.name)
                                        ? { backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }
                                        : {})
                                    }}
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Remaining
                                  </label>
                                  <div className={`text-xl font-bold ${
                                    remainingValue !== null && remainingValue > 0 
                                      ? 'text-red-600' 
                                      : remainingValue === 0 
                                        ? 'text-green-600' 
                                        : 'text-gray-600'
                                  }`}>
                                    {remainingValue !== null 
                                      ? remainingValue.toLocaleString() 
                                      : '—'} Rs
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Payment Method
                                  </label>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handlePaymentMethodChange(person.name, 'cash')}
                                      disabled={isPaymentSaved(person.name) && !isEditing(person.name)}
                                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                                        paymentMethod === 'cash'
                                          ? 'bg-green-500 hover:bg-green-600 text-white'
                                          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                      } ${
                                        isPaymentSaved(person.name) && !isEditing(person.name)
                                          ? 'opacity-50 cursor-not-allowed'
                                          : ''
                                      }`}
                                    >
                                      Cash
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePaymentMethodChange(person.name, 'account')}
                                      disabled={isPaymentSaved(person.name) && !isEditing(person.name)}
                                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                                        paymentMethod === 'account'
                                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                      } ${
                                        isPaymentSaved(person.name) && !isEditing(person.name)
                                          ? 'opacity-50 cursor-not-allowed'
                                          : ''
                                      }`}
                                    >
                                      Account
                                    </button>
                                  </div>
                                </div>
                                
                                {paymentMethod === 'cash' && (
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                      Cash Location
                                    </label>
                                    <input
                                      type="text"
                                      value={cashLocation}
                                      onChange={(e) => handleCashLocationChange(person.name, e.target.value)}
                                      placeholder="Enter place/location"
                                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                                      disabled={isPaymentSaved(person.name) && !isEditing(person.name)}
                                      style={{
                                        ...(isPaymentSaved(person.name) && !isEditing(person.name)
                                          ? { backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }
                                          : {})
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Payment

