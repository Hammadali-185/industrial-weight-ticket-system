import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Utilities for parsing frames and stability detection
const WEIGHT_REGEX = /^=([0-9]{2,3}\.[0-9]{3})([0-9+-]?)$/

function normalizeReversed(frame) {
	// If exactly =DDD.DDD, reverse digits only
	if (/^=\d{3}\.\d{3}$/.test(frame)) {
		const six = frame.slice(1).replace('.', '')
		const rev = six.split('').reverse().join('')
		return `=${rev.slice(0,3)}.${rev.slice(3)}`
	}
	return frame
}

export function parseWeightKg(frame) {
	const norm = normalizeReversed(frame.trim())
	const m = norm.match(WEIGHT_REGEX)
	if (!m) return null
	const magnitude = m[1]
	const trail = m[2]
	const value = parseFloat(magnitude)
	const intPart = magnitude.split('.')[0]
	let kg
	if (magnitude === '000.010') kg = 10.0
	else if (intPart.length === 3) kg = value
	else kg = value * 100000.0
	if (trail === '-') kg = -kg
	return parseFloat(kg.toFixed(3))
}

export function detectStable(readings, required = 5) {
	if (readings.length < required) return null
	const base = Number(readings[readings.length - required].toFixed(3))
	for (let i = readings.length - required; i < readings.length; i++) {
		if (Number(readings[i].toFixed(3)) !== base) return null
	}
	return base
}

// Real serial connection using Web Serial API - matches Python logic
// NOTE: This function is ONLY for web mode, NOT for Electron mode
// DO NOT CALL THIS IN ELECTRON MODE - it will throw errors
async function connectToRealDevice(forceNewPort = false, requireUserSelection = false) {
	// Check if we're in Electron mode - if so, throw error
	if (typeof window !== 'undefined' && window.nativeAPI) {
		throw new Error('Cannot use Web Serial API in Electron mode. Use IPC instead.')
	}
	
	// Check if Web Serial API is available (web mode only)
	if (typeof navigator === 'undefined' || !('serial' in navigator)) {
		throw new Error('Web Serial API not supported in this browser. Please use Chrome or Edge.')
	}
	
	// Test multiple baudrates like Python version
	const testBaudrates = [9600, 19200, 115200, 4800, 38400]
	
	try {
		let ports = []
		
		// Get available ports first (previously granted)
		const grantedPorts = await navigator.serial.getPorts()
		console.log('Previously granted ports:', grantedPorts.length)
		
		// Only request new port if explicitly required (user clicked button) or no granted ports exist
		if (requireUserSelection || (forceNewPort && grantedPorts.length === 0)) {
			// Request user to select a port (only when explicitly needed)
			console.log('Requesting new port selection (user action required)...')
			try {
				const newPort = await navigator.serial.requestPort({
					filters: [] // Empty filters = show all ports
				})
				
				if (!newPort) {
					throw new Error('Port selection returned null')
				}
				
				ports.push(newPort)
				const portInfo = newPort.getInfo()
				console.log('✅ User selected port:', portInfo)
			} catch (err) {
				console.log('Port selection error:', err.message, err.name)
				// If user cancelled but we have granted ports, use those
				if (grantedPorts.length > 0) {
					console.log('Using previously granted ports:', grantedPorts.length)
					ports = grantedPorts
				} else {
					// Only throw error if we have no ports at all
					if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
						throw new Error('Permission required. Please click "Reconnect" and allow access when prompted.')
					} else {
						throw new Error(`Port selection failed: ${err.message}`)
					}
				}
			}
		} else {
			// AUTO-CONNECT: Use previously granted ports automatically
			console.log('Auto-connecting using previously granted ports:', grantedPorts.length)
			ports = grantedPorts
		}
		
		if (ports.length === 0) {
			throw new Error('No ports available. Device may need permission. Click "Reconnect" to grant access once, then it will auto-connect.')
		}
		
		console.log(`Testing ${ports.length} port(s) with ${testBaudrates.length} baudrate(s)...`)
		
		// Try each available port (like Python scan_ports)
		for (const port of ports) {
			const portInfo = port.getInfo()
			const portName = portInfo.path || `Port ${portInfo.usbVendorId || 'unknown'}`
			console.log(`Testing port: ${portName}`)
			
			// Try each baudrate (like Python test_port_connection)
			for (const baudrate of testBaudrates) {
				try {
					console.log(`  Testing ${portName} @ ${baudrate} baud...`)
					// Close port if already open (check both readable and writable states)
					try {
						if (port.readable) {
							// Check if there's an active reader
							if (port.readable.locked) {
								// Port is locked, we can't close it yet - skip this port/baudrate
								continue
							}
						}
						if (port.readable || port.writable) {
							await port.close()
							// Wait a bit for port to fully close
							await new Promise(resolve => setTimeout(resolve, 100))
						}
					} catch (e) {
						// Port might already be closed or in invalid state
						// Continue to try opening it
					}
					
					// Open connection with YH-T7E settings
					await port.open({
						baudRate: baudrate,
						dataBits: 8,
						parity: 'none',
						stopBits: 1,
						flowControl: 'none'
					})
					
					// Wait a moment for port to stabilize
					await new Promise(resolve => setTimeout(resolve, 100))
					
					// Test if we can get a reader
					if (port.readable.locked) {
						try {
							await port.close()
						} catch (e) {
							// Ignore close errors
						}
						continue
					}
					
					const reader = port.readable.getReader()
					const decoder = new TextDecoder()
					let buffer = ''
					let validFrames = 0
					let rawDataReceived = ''
					
					// Read for 2 seconds to test (increased from 1.5s to give device more time)
					const startTime = Date.now()
					while (Date.now() - startTime < 2000) {
						try {
							const { value, done } = await reader.read()
							if (done) break
							
							if (value) {
								const decoded = decoder.decode(value, { stream: true })
								buffer += decoded
								rawDataReceived += decoded
								
								// Log first 100 chars of raw data for debugging
								if (rawDataReceived.length <= 100) {
									console.log(`    Raw data received (${rawDataReceived.length} chars):`, JSON.stringify(rawDataReceived))
								}
								
								// Look for valid frames (like Python buffer scanning)
								let i = 0
								while (i <= buffer.length - 8) {
									if (buffer[i] === '=') {
										const frame = buffer.slice(i, i + 8)
										const weight = parseWeightKg(frame)
										if (weight !== null) {
											validFrames++
											console.log(`    ✅ Found valid frame ${validFrames}/2: ${frame} = ${weight} kg`)
											if (validFrames >= 2) {
												// Found valid device, store baudrate and close test reader
												console.log(`    ✅ Device found! Using ${portName} @ ${baudrate} baud`)
												port._detectedBaudrate = baudrate
												try {
													reader.releaseLock()
												} catch (e) {
													// Ignore release errors
												}
												// Don't close port here - we'll use it for the main connection
												return port
											}
										} else {
											// Log invalid frame for debugging
											console.log(`    ⚠️ Invalid frame format: ${JSON.stringify(frame)}`)
										}
										i += 1
									} else {
										i += 1
									}
								}
								
								// Keep buffer manageable (like Python)
								if (buffer.length > 128) {
									buffer = buffer.slice(-128)
								}
							}
						} catch (e) {
							// Read error - break and try next baudrate
							console.log(`    Read error @ ${baudrate} baud:`, e.message)
							break
						}
					}
					
					// Close test connection if no valid frames found
					if (rawDataReceived.length > 0) {
						console.log(`    ⚠️ Received ${rawDataReceived.length} chars but no valid frames @ ${baudrate} baud`)
						console.log(`    Raw data sample: ${JSON.stringify(rawDataReceived.substring(0, 50))}`)
					} else {
						console.log(`    ⚠️ No data received @ ${baudrate} baud (device might be off or not connected)`)
					}
					try {
						reader.releaseLock()
					} catch (e) {
						// Ignore release errors
					}
					try {
						await port.close()
					} catch (e) {
						// Ignore close errors
					}
					
				} catch (e) {
					// Port/baudrate failed, try next one
					console.log(`    Error testing ${portName} @ ${baudrate} baud:`, e.message)
					try {
						await port.close()
					} catch (closeErr) {
						// Ignore close errors
					}
					continue
				}
			}
		}
		
		console.log('❌ No valid device found after testing all ports and baudrates')
		throw new Error('No valid YH-T7E device found. Please ensure:\n1. Device is connected and powered ON\n2. Select the correct port when prompted\n3. Device is sending data in format =DDD.DDD')
		
	} catch (error) {
		console.error('Connection error:', error)
		throw new Error(`Failed to connect: ${error.message}`)
	}
}


// Check if running in Electron
const isElectron = () => {
	return typeof window !== 'undefined' && window.nativeAPI
}

export function useSerialConnection() {
	const [status, setStatus] = useState('connecting') // connecting | on | off
	const [port, setPort] = useState(null)
	const [baud, setBaud] = useState(null)
	const [logs, setLogs] = useState([])
	const [readings, setReadings] = useState([])
	const [stableWeight, setStableWeight] = useState(null)
	const serialPortRef = useRef(null)
	const reconnectTimeoutRef = useRef(null)
	const isReconnectingRef = useRef(false)
	const readerRef = useRef(null)
	const readingActiveRef = useRef(false)
	const electronModeRef = useRef(isElectron())
	const readingsHistoryRef = useRef([])

	const appendLog = useCallback((msg) => {
		setLogs((prev) => [msg, ...prev].slice(0, 50))
	}, [])

	const disconnect = async () => {
		readingActiveRef.current = false
		
		// Release reader lock first
		if (readerRef.current) {
			try {
				await readerRef.current.releaseLock()
			} catch (e) {
				// Ignore
			}
			readerRef.current = null
		}
		
		// Close port and wait for it to fully close
		if (serialPortRef.current) {
			try {
				// Close the port
				await serialPortRef.current.close()
				// Wait a bit longer to ensure port is fully released
				await new Promise(resolve => setTimeout(resolve, 300))
			} catch (e) {
				// Ignore close errors, but still wait
				await new Promise(resolve => setTimeout(resolve, 300))
			}
			serialPortRef.current = null
		}
	}
	
	// Aggressive disconnect: Close ALL granted ports (like Ctrl+R)
	// NOTE: This is ONLY for web mode, NOT for Electron mode
	const disconnectAll = async () => {
		// Electron mode: Do nothing, main process handles disconnection
		const isElectronMode = typeof window !== 'undefined' && window.nativeAPI
		if (isElectronMode) {
			return
		}
		
		readingActiveRef.current = false
		
		// Release reader lock
		if (readerRef.current) {
			try {
				await readerRef.current.releaseLock()
			} catch (e) {
				// Ignore
			}
			readerRef.current = null
		}
		
		// Close current port
		if (serialPortRef.current) {
			try {
				await serialPortRef.current.close()
			} catch (e) {
				// Ignore
			}
			serialPortRef.current = null
		}
		
		// Close ALL previously granted ports (like Ctrl+R does) - Web mode only
		if (typeof navigator !== 'undefined' && 'serial' in navigator) {
			try {
				const grantedPorts = await navigator.serial.getPorts()
				console.log(`Closing ${grantedPorts.length} previously granted port(s)...`)
				for (const port of grantedPorts) {
					try {
						// Close port if it's open
						if (port.readable || port.writable) {
							await port.close()
						}
					} catch (e) {
						// Ignore individual port close errors
						console.log('Error closing granted port:', e)
					}
				}
				// Wait longer to ensure all ports are fully released
				await new Promise(resolve => setTimeout(resolve, 500))
			} catch (e) {
				console.error('Error closing granted ports:', e)
			}
		}
	}

	const connectToReal = async (forceNewPort = false, requireUserSelection = false) => {
		// Check for Electron mode (always check, don't rely on ref)
		const isElectronMode = typeof window !== 'undefined' && window.nativeAPI
		
		// Electron mode: Skip Web Serial API completely, use IPC instead
		if (isElectronMode) {
			electronModeRef.current = true // Update ref
			appendLog('ℹ️ Electron mode: Connection handled by main process')
			appendLog('💡 Use "Reconnect Weight Machine" button to trigger reconnection')
			setStatus('connecting')
			// DO NOT call any Web Serial API functions
			return
		}
		
		// Update ref for web mode
		electronModeRef.current = false
		
		// Web mode only: Check if Web Serial API is available
		if (typeof navigator === 'undefined' || !('serial' in navigator)) {
			appendLog('❌ Web Serial API not supported in this browser')
			setStatus('off')
			return
		}
		
		try {
			setStatus('connecting')
			if (requireUserSelection) {
				appendLog('🔌 Please select your device\'s COM port from the dialog...')
			} else {
				appendLog('🔌 Auto-connecting to device...')
			}
			console.log('Starting connection process, forceNewPort:', forceNewPort, 'requireUserSelection:', requireUserSelection)
			
			const serialPort = await connectToRealDevice(forceNewPort, requireUserSelection)
			
			// Ensure port is ready before using it
			if (!serialPort || !serialPort.readable) {
				throw new Error('Port is not ready after connection test')
			}
			
			serialPortRef.current = serialPort
			
			const portInfo = serialPort.getInfo()
			const detectedBaud = serialPort._detectedBaudrate || 9600
			// Better port name detection
			let portName = 'Serial Port'
			if (portInfo.path) {
				portName = portInfo.path
			} else if (portInfo.usbVendorId && portInfo.usbProductId) {
				portName = `USB ${portInfo.usbVendorId.toString(16)}:${portInfo.usbProductId.toString(16)}`
			} else if (portInfo.usbVendorId) {
				portName = `USB Vendor ${portInfo.usbVendorId.toString(16)}`
			}
			
			setPort(portName)
			setBaud(detectedBaud)
			appendLog(`✅ Machine connected on ${portName} @ ${detectedBaud} baud`)
			
			// Wait a moment for port to stabilize
			await new Promise(resolve => setTimeout(resolve, 200))
			
			// Check if port is still available and not locked
			if (!serialPort.readable) {
				appendLog('❌ Port readable stream not available')
				await serialPort.close()
				if (!isReconnectingRef.current) {
					isReconnectingRef.current = true
					if (reconnectTimeoutRef.current) {
						clearTimeout(reconnectTimeoutRef.current)
					}
					reconnectTimeoutRef.current = setTimeout(() => {
						isReconnectingRef.current = false
						connectToReal(false)
					}, 1000)
				}
				return
			}
			
			if (serialPort.readable.locked) {
				appendLog('❌ Port already locked, waiting and retrying...')
				// Wait a bit and try to get the lock
				await new Promise(resolve => setTimeout(resolve, 500))
				if (serialPort.readable.locked) {
					appendLog('❌ Port still locked, reconnecting...')
					try {
						await serialPort.close()
					} catch (e) {
						// Ignore
					}
					if (!isReconnectingRef.current) {
						isReconnectingRef.current = true
						if (reconnectTimeoutRef.current) {
							clearTimeout(reconnectTimeoutRef.current)
						}
						reconnectTimeoutRef.current = setTimeout(() => {
							isReconnectingRef.current = false
							connectToReal(false)
						}, 1000)
					}
					return
				}
			}
			
			const reader = serialPort.readable.getReader()
			readerRef.current = reader
			readingActiveRef.current = true
			setStatus('on')
			const decoder = new TextDecoder()
			let buffer = ''
			
			// Use a more resilient reading approach
			const readLoop = async () => {
				while (readingActiveRef.current && serialPortRef.current === serialPort) {
					try {
						const { value, done } = await reader.read()
						if (done) break
					
					if (value) {
						buffer += decoder.decode(value, { stream: true })
						
						// Look for frames like =DDD.DDD (matches Python parsing)
						// Process all frames in buffer
						let i = 0
						let foundFrame = false
						while (i <= buffer.length - 8) {
							if (buffer[i] === '=') {
								const frame = buffer.slice(i, i + 8)
								const kg = parseWeightKg(frame)
								if (kg != null && !isNaN(kg) && isFinite(kg)) {
									foundFrame = true
									// Ensure status is 'on' when receiving valid readings
									setStatus((currentStatus) => {
										if (currentStatus !== 'on' && serialPortRef.current === serialPort) {
											return 'on'
										}
										return currentStatus
									})
									
									setReadings((prev) => {
										const newReadings = [...prev.slice(-49), kg]
										// Check for stable value after updating readings
										const stable = detectStable(newReadings, 5)
										if (stable !== null && stable !== undefined) {
											setStableWeight(stable)
										}
										return newReadings
									})
									appendLog(`Reading: ${kg.toFixed(3)} kg  |  ${frame}`)
									// Move past this frame
									i += 8
								} else {
									i += 1
								}
							} else {
								i += 1
							}
						}
						
						// If we found a frame, keep the remaining buffer (might be start of next frame)
						// Otherwise, keep buffer manageable
						if (foundFrame && i > 0) {
							// Keep unprocessed part of buffer
							buffer = buffer.slice(i)
						} else if (buffer.length > 256) {
							// Keep last 128 chars if buffer is too large
							buffer = buffer.slice(-128)
						}
					}
					} catch (readError) {
						// Check if error is due to page visibility/background - these are usually recoverable
						const isRecoverableError = readError.message.includes('timeout') || 
						                           readError.message.includes('The operation was aborted') ||
						                           !serialPort.readable.locked
						
						if (isRecoverableError && readingActiveRef.current && serialPortRef.current === serialPort) {
							// Recoverable error - continue reading after a short delay
							await new Promise(resolve => setTimeout(resolve, 100))
							continue
						}
						
						appendLog(`❌ Read error: ${readError.message}`)
						readingActiveRef.current = false
						
						// Release reader lock before reconnecting
						try {
							if (readerRef.current) {
								await readerRef.current.releaseLock()
								readerRef.current = null
							}
						} catch (e) {
							// Ignore release errors
						}
						
						// Close and reconnect automatically (only if not already reconnecting)
						// Electron mode: Do not reconnect using Web Serial API
						if (!isReconnectingRef.current && !electronModeRef.current) {
							try {
								await serialPort.close()
							} catch (e) {
								// Ignore close errors
							}
							serialPortRef.current = null
							setStatus('connecting')
							appendLog('🔄 Auto-reconnecting after read error...')
							isReconnectingRef.current = true
							// Clear any existing timeout
							if (reconnectTimeoutRef.current) {
								clearTimeout(reconnectTimeoutRef.current)
							}
							// Wait a bit then reconnect (Web mode only)
							reconnectTimeoutRef.current = setTimeout(() => {
								isReconnectingRef.current = false
								connectToReal(false)
							}, 2000)
						}
						return
					}
				}
			}
			
			// Start the reading loop (don't await - it runs independently)
			readLoop().catch(async (error) => {
				// Handle unhandled errors in read loop
				readingActiveRef.current = false
				appendLog(`❌ Read loop error: ${error.message}`)
				
				try {
					if (readerRef.current) {
						await readerRef.current.releaseLock()
						readerRef.current = null
					}
				} catch (e) {
					// Ignore
				}
				
				// Electron mode: Do not reconnect using Web Serial API
				if (!isReconnectingRef.current && serialPortRef.current === serialPort && !electronModeRef.current) {
					try {
						await serialPort.close()
					} catch (e) {
						// Ignore
					}
					serialPortRef.current = null
					setStatus('connecting')
					appendLog('🔄 Auto-reconnecting after loop error...')
					isReconnectingRef.current = true
					if (reconnectTimeoutRef.current) {
						clearTimeout(reconnectTimeoutRef.current)
					}
					reconnectTimeoutRef.current = setTimeout(() => {
						isReconnectingRef.current = false
						connectToReal(false)
					}, 2000)
				}
			})
			
			// Note: readLoop runs independently, so we don't need to handle loop exit here
			
		} catch (error) {
			setStatus('off')
			appendLog(`❌ Connection error: ${error.message}`)
			
			// Electron mode: Do not auto-reconnect using Web Serial API
			if (electronModeRef.current && window.nativeAPI) {
				appendLog('💡 Main process will handle reconnection automatically')
				return
			}
			
			// Web mode only: Auto-reconnect if not already reconnecting AND not manually triggered
			// Don't auto-reconnect if user just clicked reconnect - let them try again
			if (!isReconnectingRef.current) {
				appendLog('💡 Tip: Click "Reconnect" button to select a port manually')
				appendLog('🔄 Auto-reconnecting in 5 seconds... (or click Reconnect to select port now)')
				isReconnectingRef.current = true
				// Clear any existing timeout
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current)
				}
				// Auto-reconnect after error (try previously granted ports automatically)
				reconnectTimeoutRef.current = setTimeout(() => {
					isReconnectingRef.current = false
					connectToReal(false, false) // Auto-reconnect, no user selection needed
				}, 5000) // Increased from 3 to 5 seconds
			}
		}
	}

	const reconnect = useCallback(async () => {
		// Check for Electron mode first (always check, don't rely on ref)
		const isElectronMode = typeof window !== 'undefined' && window.nativeAPI
		
		// Prevent multiple simultaneous reconnection attempts
		if (isReconnectingRef.current) {
			console.log('[useSerialConnection] Reconnect already in progress, skipping...')
			return
		}
		
		isReconnectingRef.current = true
		
		// Clear any pending reconnection timeouts (stop auto-reconnect)
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}
		
		// Reset all state first (like Ctrl+R)
		setStatus('connecting')
		setPort(null)
		setBaud(null)
		setReadings([])
		setStableWeight(null)
		// Clear logs for fresh start (like Ctrl+R)
		setLogs([])
		// Add fresh log after clearing (using setTimeout to ensure state update completes)
		await new Promise(resolve => setTimeout(resolve, 10))
		appendLog('🔄 Manual reconnect requested (full reset like Ctrl+R)...')
		
		// Electron mode: Use IPC to reconnect serial port
		if (isElectronMode && window.nativeAPI && window.nativeAPI.requestReconnect) {
			electronModeRef.current = true // Update ref
			try {
				appendLog('🔄 Requesting weight machine reconnection via main process...')
				await window.nativeAPI.requestReconnect()
				appendLog('✅ Reconnection request sent to main process')
				appendLog('💡 Main process will scan and connect to weight machine')
				// Status will be updated via IPC events
				// Reset flag after a delay to allow connection to complete
				setTimeout(() => {
					isReconnectingRef.current = false
				}, 3000)
				return
			} catch (e) {
				console.error('Error reconnecting via Electron:', e)
				appendLog(`❌ Reconnection error: ${e.message}`)
				isReconnectingRef.current = false
				return
			}
		}
		
		// Web mode: Aggressively disconnect ALL ports (like Ctrl+R does)
		if (!isElectronMode) {
			electronModeRef.current = false // Update ref
			appendLog('🔄 Closing all ports and resetting...')
			await disconnectAll()
			appendLog('✅ All ports closed. Ready for fresh connection.')
			
			// Wait a bit longer to ensure ports are fully released
			await new Promise(resolve => setTimeout(resolve, 800))
			
			// Always request a NEW port selection (like Ctrl+R - fresh start)
			appendLog('📌 Requesting new port selection...')
			appendLog('💡 Please select your device from the dialog')
			try {
				await connectToReal(true, true) // Always request new port selection
				// Reset flag after connection attempt
				isReconnectingRef.current = false
			} catch (e) {
				console.error('Error during reconnect:', e)
				appendLog(`❌ Reconnection error: ${e.message}`)
				// Reset flag even on error
				isReconnectingRef.current = false
				// Try one more time after a delay
				setTimeout(async () => {
					if (!isReconnectingRef.current) {
						isReconnectingRef.current = true
						try {
							appendLog('🔄 Retrying connection...')
							await connectToReal(true, true)
							isReconnectingRef.current = false
						} catch (retryError) {
							appendLog(`❌ Retry failed: ${retryError.message}`)
							setStatus('off')
							isReconnectingRef.current = false
						}
					}
				}, 2000)
			}
		}
	}, [disconnectAll, connectToReal, appendLog])

	// Handle page visibility changes to keep connection alive (Web mode only)
	useEffect(() => {
		// Electron mode: Main process handles connection, no need for visibility checks
		if (electronModeRef.current && window.nativeAPI) {
			return
		}
		
		let lastReadingCheck = Date.now()
		const readingCheckInterval = setInterval(() => {
			// Check if we're receiving readings - if so, ensure status is 'on'
			if (serialPortRef.current && readings.length > 0) {
				if (status !== 'on') {
					setStatus('on')
					appendLog('✅ Connection active (readings detected)')
				}
				lastReadingCheck = Date.now()
			}
		}, 5000) // Check every 5 seconds
		
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				// Page became visible - check if reading is still active
				if (serialPortRef.current) {
					// If we have readings coming in, ensure status is 'on'
					if (readings.length > 0 && status !== 'on') {
						setStatus('on')
						appendLog('📄 Page visible, connection active (readings detected)')
						return
					}
					
					if (status === 'on') {
						if (!readingActiveRef.current || !readerRef.current) {
							// Connection exists but reading stopped - resume
							appendLog('📄 Page visible, resuming connection...')
							disconnect().then(() => {
								setTimeout(() => {
									if (!isReconnectingRef.current) {
										connectToReal(false)
									}
								}, 500)
							})
						}
					} else if (status === 'off' && !isReconnectingRef.current) {
						// Status is off, try to reconnect
						appendLog('📄 Page visible, reconnecting...')
						setTimeout(() => {
							if (!isReconnectingRef.current) {
								connectToReal(false)
							}
						}, 500)
					}
				}
			}
		}
		
		const handleWindowFocus = () => {
			// Window regained focus - ensure connection is active
			if (serialPortRef.current) {
				// If we have readings coming in, ensure status is 'on'
				if (readings.length > 0 && status !== 'on') {
					setStatus('on')
					appendLog('🔄 Window focused, connection active (readings detected)')
					return
				}
				
				if (status === 'on' && (!readingActiveRef.current || !readerRef.current)) {
					appendLog('🔄 Window focused, resuming connection...')
					disconnect().then(() => {
						setTimeout(() => {
							if (!isReconnectingRef.current) {
								connectToReal(false)
							}
						}, 500)
					})
				} else if (status === 'off' && !isReconnectingRef.current) {
					appendLog('🔄 Window focused, reconnecting...')
					setTimeout(() => {
						if (!isReconnectingRef.current) {
							connectToReal(false)
						}
					}, 500)
				}
			}
		}
		
		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('focus', handleWindowFocus)
		
		return () => {
			clearInterval(readingCheckInterval)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.removeEventListener('focus', handleWindowFocus)
		}
	}, [status, appendLog, connectToReal, disconnect, readings.length])
	
	// Electron IPC event listeners - use nativeAPI.onWeightLive and onWeightStable
	useEffect(() => {
		if (!electronModeRef.current || !window.nativeAPI) {
			return // Not in Electron mode
		}
		
		// Listen to live weight readings from main process
		if (window.nativeAPI.onWeightLive) {
			const handleWeightLive = (weight) => {
				const kg = parseFloat(weight)
				if (!isNaN(kg) && isFinite(kg)) {
					setReadings((prev) => {
						const newReadings = [...prev.slice(-49), kg]
						return newReadings
					})
					appendLog(`Reading: ${kg.toFixed(3)} kg`)
					setStatus('on')
				}
			}
			
			window.nativeAPI.onWeightLive(handleWeightLive)
			
			// Cleanup
			return () => {
				if (window.nativeAPI && window.nativeAPI.removeWeightLiveListener) {
					window.nativeAPI.removeWeightLiveListener()
				}
			}
		}
	}, [appendLog])
	
	// Listen to stable weight readings from main process
	useEffect(() => {
		if (!electronModeRef.current || !window.nativeAPI) {
			return // Not in Electron mode
		}
		
		if (window.nativeAPI.onWeightStable) {
			const handleWeightStable = (weight) => {
				const kg = parseFloat(weight)
				if (!isNaN(kg) && isFinite(kg)) {
					setStableWeight(kg)
					appendLog(`✅ Stable weight: ${kg.toFixed(3)} kg`)
				}
			}
			
			window.nativeAPI.onWeightStable(handleWeightStable)
			
			// Cleanup
			return () => {
				if (window.nativeAPI && window.nativeAPI.removeWeightStableListener) {
					window.nativeAPI.removeWeightStableListener()
				}
			}
		}
	}, [appendLog])
	
	// Listen to connection status updates from main process
	useEffect(() => {
		if (!electronModeRef.current || !window.nativeAPI) {
			return // Not in Electron mode
		}
		
		if (window.nativeAPI.onSerialStatus) {
			const handleSerialStatus = (statusData) => {
				const { status, port } = statusData
				console.log('[useSerialConnection] Serial status update:', status, port)
				
				if (status === 'connecting') {
					setStatus('connecting')
					if (port) {
						setPort(port)
					}
				} else if (status === 'connected') {
					setStatus('on')
					if (port) {
						setPort(port)
						setBaud(9600)
					}
				} else if (status === 'disconnected') {
					setStatus('off')
					setPort(null)
					setBaud(null)
				}
			}
			
			window.nativeAPI.onSerialStatus(handleSerialStatus)
			
			// Cleanup
			return () => {
				if (window.nativeAPI && window.nativeAPI.removeSerialStatusListener) {
					window.nativeAPI.removeSerialStatusListener()
				}
			}
		}
	}, [])
	
	// Listen to detailed serial logs from main process
	useEffect(() => {
		if (!electronModeRef.current || !window.nativeAPI) {
			return // Not in Electron mode
		}
		
		if (window.nativeAPI.onSerialLog) {
			const handleSerialLog = (logData) => {
				const { message, level } = logData
				// Display all logs from main process in the UI
				appendLog(message)
			}
			
			window.nativeAPI.onSerialLog(handleSerialLog)
			
			// Cleanup
			return () => {
				if (window.nativeAPI && window.nativeAPI.removeSerialLogListener) {
					window.nativeAPI.removeSerialLogListener()
				}
			}
		}
	}, [appendLog])
	
	// Listen to serial status updates from main process (Electron mode)
	// Note: Status updates are handled via IPC events from main process
	// The main process sends 'serial-status' events which we can listen to if needed
	// For now, status is managed via weight-update events
	
	useEffect(() => {
		// Check for Electron mode (nativeAPI should be available from preload script)
		const checkElectronMode = () => {
			const hasNativeAPI = typeof window !== 'undefined' && window.nativeAPI
			console.log('[useSerialConnection] Electron mode check:', hasNativeAPI, 'window.nativeAPI:', window.nativeAPI)
			return hasNativeAPI
		}
		
		// Electron mode: Main process handles auto-connection - DO NOT use Web Serial API
		if (checkElectronMode()) {
			electronModeRef.current = true
			appendLog('🚀 Electron mode: Serial connection handled by main process')
			appendLog('💡 Main process will auto-connect to weight machine')
			appendLog('💡 Connection status will update automatically via IPC events')
			setStatus('connecting')
			// Do NOT call any Web Serial API functions in Electron mode
			// Just wait for IPC events from main process
			return
		}
		
		// Update electronModeRef if not in Electron
		electronModeRef.current = false
		
		// Web mode only: AUTO-CONNECT on initial load using Web Serial API
		// This should NOT run in Electron mode
		if (typeof navigator === 'undefined' || !('serial' in navigator)) {
			appendLog('⚠️ Web Serial API not available')
			return
		}
		
		appendLog('🚀 Auto-connecting to device...')
		
		// Try to auto-connect using previously granted ports
		const autoConnect = async () => {
			try {
				const grantedPorts = await navigator.serial.getPorts()
				if (grantedPorts.length > 0) {
					appendLog(`✅ Found ${grantedPorts.length} previously granted port(s)`)
					appendLog('🔄 Auto-connecting...')
					// Small delay to let UI update
					await new Promise(resolve => setTimeout(resolve, 300))
					connectToReal(false, false) // Auto-connect, no user selection needed
				} else {
					appendLog('ℹ️ No previously granted ports found')
					appendLog('💡 Click "Reconnect" button once to grant permission')
					appendLog('💡 After that, it will auto-connect on future loads')
				}
			} catch (e) {
				console.error('Error checking granted ports:', e)
				appendLog('💡 Click "Reconnect" button to grant permission')
			}
		}
		
		autoConnect()
		
		return () => {
			// Cleanup on unmount (Web mode only)
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current)
			}
			isReconnectingRef.current = false
			readingActiveRef.current = false
			// Only disconnect if not in Electron mode
			if (!electronModeRef.current) {
				disconnect()
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return { status, port, baud, logs, readings, stableWeight, reconnect }
}


