import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useSerialConnection } from '../hooks/useSerialConnection'

// Create the Weight Context
const WeightContext = createContext()

// Custom hook to use the weight context
export const useWeight = () => {
  const context = useContext(WeightContext)
  if (!context) {
    throw new Error('useWeight must be used within a WeightProvider')
  }
  return context
}

// Weight Provider Component - manages global serial connection
export const WeightProvider = ({ children }) => {
  // Initialize serial connection at the global level
  const {
    status,
    port,
    baud,
    serialLineCoding,
    logs,
    readings,
    stableWeight: serialStableWeight,
    reconnect,
    serialPreview
  } = useSerialConnection()

  // Global state for weight
  const [stableWeight, setStableWeight] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('off')

  // Update global weight from serial connection
  useEffect(() => {
    if (serialStableWeight !== null) {
      setStableWeight(serialStableWeight)
    }
  }, [serialStableWeight])

  // Update connection status from serial connection
  useEffect(() => {
    setConnectionStatus(status)
    setIsConnected(status === 'on')
  }, [status])

  const value = {
    stableWeight,
    isConnected,
    connectionStatus: status, // Alias for backward compatibility
    status, // Primary status from serial connection
    port,
    baud,
    serialLineCoding,
    logs,
    readings,
    reconnect,
    serialPreview,
    // Keep these for backward compatibility if needed
    updateStableWeight: useCallback((weight) => {
      setStableWeight(weight)
    }, []),
    updateConnectionStatus: useCallback((newStatus, connected = false) => {
      // This is now just for backward compatibility - status comes from serial connection
      // Don't override the serial connection status
    }, [])
  }

  return (
    <WeightContext.Provider value={value}>
      {children}
    </WeightContext.Provider>
  )
}






