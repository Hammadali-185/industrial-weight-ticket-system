import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Utilities for parsing frames and stability detection
const WEIGHT_REGEX = /^=([0-9]{1,3}\.[0-9]{3})([0-9+-]?)$/
// Exactly two decimal digits (e.g. =50.25); trailing char only +/- so we do not steal =123.456
const WEIGHT_REGEX_2DEC = /^=([0-9]{1,3}\.[0-9]{2})([+-]?)$/

const LAST_SCALE_USB_KEY = 'weight-dashboard-last-scale-usb'

/**
 * Optional USB filters for the **first** `requestPort()` (Reconnect / no granted ports).
 * Leave empty to show all devices. Example scale cable (FTDI): `[{ usbVendorId: 0x0403 }]`
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort
 */
export const WEB_SERIAL_REQUEST_FILTERS = []

function getWebSerialRequestPortOptions() {
	const f = WEB_SERIAL_REQUEST_FILTERS
	if (Array.isArray(f) && f.length > 0) return { filters: f }
	return { filters: [], acceptAllDevices: true }
}

/** USB–UART chips common on cheap RS232 cables / industrial scales (probe these before odd devices). */
const SCALE_LIKELY_USB_VENDOR_IDS = new Set([
	0x0403, // FTDI
	0x1a86, // CH340 / CH341
	0x10c4, // Silicon Labs CP210x
	0x067b, // Prolific PL2303
])

function readLastScaleUsbPref() {
	if (typeof localStorage === 'undefined') return null
	try {
		const pref = localStorage.getItem(LAST_SCALE_USB_KEY)
		if (!pref) return null
		const parts = pref.split(':')
		const pv = parseInt(parts[0], 10)
		const pp = parts[1] !== '' && parts[1] !== undefined ? parseInt(parts[1], 10) : NaN
		if (Number.isNaN(pv)) return null
		return { vid: pv, pid: Number.isNaN(pp) ? null : pp }
	} catch {
		return null
	}
}

function portMatchesLastScaleUsb(port, pref) {
	if (!pref) return false
	try {
		const info = port.getInfo()
		if (info.usbVendorId !== pref.vid) return false
		if (pref.pid == null) return true
		return info.usbProductId === pref.pid
	} catch {
		return false
	}
}

/** Lower score = probed earlier. Last successful scale first, then common USB-serial chips, then rest. */
function weightProbeSortScore(port) {
	let score = 500
	try {
		const info = port.getInfo()
		const vid = info.usbVendorId
		if (vid != null && SCALE_LIKELY_USB_VENDOR_IDS.has(vid)) score -= 80
		const path = info.path != null ? String(info.path) : ''
		if (/bluetooth|rfcomm|bthmodem/i.test(path)) score += 120
	} catch {
		// ignore
	}
	return score
}

/**
 * Order granted ports for auto-detect: find the one emitting `=…` weight frames without asking the user.
 * Chrome still requires **one-time permission per port** (Reconnect); then all granted ports are probed here.
 */
function orderPortsForWeightProbe(ports) {
	if (!ports || ports.length <= 1) return ports || []
	const pref = readLastScaleUsbPref()
	const ranked = [...ports].sort((a, b) => {
		const aLast = portMatchesLastScaleUsb(a, pref)
		const bLast = portMatchesLastScaleUsb(b, pref)
		if (aLast && !bLast) return -1
		if (!aLast && bLast) return 1
		const da = weightProbeSortScore(a)
		const db = weightProbeSortScore(b)
		if (da !== db) return da - db
		return 0
	})
	return ranked
}

function truncateForProbeLog(str, maxLen = 140) {
	if (!str || typeof str !== 'string') return ''
	const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '·')
	return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen)}…`
}

/** Chrome often omits `path`; show USB id + common chip names so "1027" is not mistaken for COM# */
function formatSerialPortLabel(port) {
	try {
		const info = port && typeof port.getInfo === 'function' ? port.getInfo() : {}
		if (info.path) return String(info.path)
		const vid = info.usbVendorId
		const pid = info.usbProductId
		if (vid != null && pid != null) {
			return `USB ${vid.toString(16)}:${pid.toString(16)} (not COM# — check Device Manager for COMx)`
		}
		if (vid != null) {
			const vhex = `0x${vid.toString(16)}`
			const name =
				vid === 0x0403 || vid === 1027
					? 'FTDI'
					: vid === 0x1a86 || vid === 6790
						? 'CH340'
						: vid === 0x10c4 || vid === 4292
							? 'Silicon Labs CP210x'
							: null
			return name
				? `USB ${name} (${vhex}) — pick matching COM in Device Manager`
				: `USB adapter ${vhex} — confirm COM# in Device Manager`
		}
	} catch {
		// ignore
	}
	return 'Serial device'
}

function saveLastSuccessfulScaleUsb(port) {
	try {
		if (typeof localStorage === 'undefined' || !port || typeof port.getInfo !== 'function') return
		const info = port.getInfo()
		if (info.usbVendorId != null) {
			const pid = info.usbProductId != null ? info.usbProductId : ''
			localStorage.setItem(LAST_SCALE_USB_KEY, `${info.usbVendorId}:${pid}`)
		}
	} catch {
		// ignore
	}
}

function normalizeReversed(frame) {
	let f = frame
	// =XX.YYYY (e.g. =00.0100) → =XXX.YYY then six-digit reverse (=000.010 → 10 kg)
	const m24 = f.match(/^=(\d{2})\.(\d{4})$/)
	if (m24) {
		const int3 = m24[1].padStart(3, '0')
		const dec3 = m24[2].slice(0, 3)
		f = `=${int3}.${dec3}`
	}
	if (/^=\d{3}\.\d{3}$/.test(f)) {
		const six = f.slice(1).replace('.', '')
		const rev = six.split('').reverse().join('')
		return `=${rev.slice(0, 3)}.${rev.slice(3)}`
	}
	return frame
}

export function parseWeightKg(frame) {
	let raw = frame.trim().replace(/^[\x02\x03\s]+/, '')
	const eqAt = raw.indexOf('=')
	if (eqAt > 0) raw = raw.slice(eqAt)
	if (!raw.startsWith('=')) return null

	// Optional sign/status after =DDD.DDD or =XX.YYYY (2+4)
	let trailChar = ''
	if (/^=\d{3}\.\d{3}.$/.test(raw) && raw.length >= 9) {
		trailChar = raw[8]
		raw = raw.slice(0, 8)
	} else if (/^=\d{2}\.\d{4}.$/.test(raw) && raw.length >= 9) {
		trailChar = raw[8]
		raw = raw.slice(0, 8)
	}

	const norm = normalizeReversed(raw)
	const m = norm.match(WEIGHT_REGEX)
	if (m) {
		const magnitude = m[1]
		const trail = m[2] || trailChar
		const value = parseFloat(magnitude)
		const intPart = magnitude.split('.')[0]
		let kg
		if (magnitude === '000.010') kg = 10.0
		else if (intPart.length === 3) kg = value
		else kg = value
		if (trail === '-') kg = -kg
		return parseFloat(kg.toFixed(3))
	}

	const m2 = raw.match(WEIGHT_REGEX_2DEC)
	if (m2) {
		let kg = parseFloat(m2[1])
		if (m2[2] === '-') kg = -kg
		return parseFloat(kg.toFixed(3))
	}

	return null
}

/** Parse one weight frame starting at buffer[start] (at '='). Tries longest slice first. */
function parseWeightFrameAt(buffer, start) {
	if (start >= buffer.length || buffer[start] !== '=') return null
	const maxEnd = Math.min(buffer.length, start + 12)
	const segment = buffer.slice(start, maxEnd)
	const nl = segment.search(/[\r\n]/)
	const window = nl === -1 ? segment : segment.slice(0, nl)
	for (let len = Math.min(window.length, 10); len >= 5; len--) {
		const chunk = window.slice(0, len)
		const kg = parseWeightKg(chunk)
		if (kg != null && !isNaN(kg) && isFinite(kg)) {
			return { kg, length: len }
		}
	}
	return null
}

const PROBE_FRAMES_TO_CONFIRM = 1

/** Weight scale line settings (must match `main/serialManager.cjs`: default 9600 8N1, no handshaking). */
export const SCALE_SERIAL_SETTINGS = {
	baudRate: 9600,
	dataBits: 8,
	parity: 'none',
	stopBits: 1,
	flowControl: 'none',
}

/**
 * Web Serial only: try these baud rates in order — framing stays 8N1 / no flow control.
 * (Locking probe to 9600 only fails when the scale is actually 19200, 115200, etc.)
 */
const WEB_PROBE_BAUD_RATES = [
	SCALE_SERIAL_SETTINGS.baudRate,
	19200,
	115200,
	57600,
	38400,
	14400,
	4800,
	230400,
]

/** Last-chance listen per baud (single granted port) if main sweep saw zero bytes */
const FINAL_SOAK_BAUDS = [SCALE_SERIAL_SETTINGS.baudRate, 19200, 115200, 57600]
const FINAL_SOAK_MS_PER_BAUD = 15000

/**
 * If false (default): do not call setSignals — matches PuTTY / older apps; forced DTR/RTS can block RX on some USB–serial chips.
 * Set true to enable the four DTR/RTS presets during probe.
 */
const WEB_SERIAL_USE_LINE_SIGNALS = false

/** Only used when WEB_SERIAL_USE_LINE_SIGNALS is true */
const SERIAL_SIGNAL_PRESET_ORDER = ['dtr_rts_high', 'dtr_rts_low', 'dtr_high', 'rts_high']

/**
 * Drive DTR/RTS when WEB_SERIAL_USE_LINE_SIGNALS is true, or when forceApply is true (auto-retry path).
 * Some USB–serial ICs only buffer RX after DTR/RTS are asserted (PuTTY often does this by default).
 */
async function applySerialSignals(port, preset, forceApply = false) {
	if (!WEB_SERIAL_USE_LINE_SIGNALS && !forceApply) return
	if (typeof port.setSignals !== 'function') return
	const map = {
		dtr_rts_high: { dataTerminalReady: true, requestToSend: true },
		dtr_rts_low: { dataTerminalReady: false, requestToSend: false },
		dtr_high: { dataTerminalReady: true, requestToSend: false },
		rts_high: { dataTerminalReady: false, requestToSend: true },
	}
	const s = map[preset] || map.dtr_rts_high
	try {
		await port.setSignals(s)
	} catch {
		// ignore
	}
}

/**
 * Open port, apply DTR/RTS preset (see SERIAL_SIGNAL_PRESET_ORDER), probe for weight or any bytes.
 * On weight match: returns open port (reader released). Otherwise closes port and returns stats.
 */
async function probeSerialCombo({
	port,
	baudrate,
	parity,
	stopBits,
	dataBits = SCALE_SERIAL_SETTINGS.dataBits,
	probeMsPerCombo,
	readChunkMs,
	probeDebugLog,
	portName,
	signalPreset = 'dtr_rts_high',
	forceLineSignals = false,
}) {
	const shapeTag = `${parity === 'none' ? 'N' : parity === 'even' ? 'E' : 'O'}${stopBits}`
	try {
		if (port.readable) {
			if (port.readable.locked) {
				return { result: 'skip_locked' }
			}
		}
		if (port.readable || port.writable) {
			await port.close()
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	} catch {
		// continue to try open
	}

	try {
		await port.open({
			baudRate: baudrate,
			dataBits,
			parity,
			stopBits,
			flowControl: SCALE_SERIAL_SETTINGS.flowControl,
			bufferSize: 16384,
		})
	} catch (e) {
		return { result: 'open_error', message: e && e.message ? e.message : String(e) }
	}

	await applySerialSignals(port, signalPreset, forceLineSignals)
	// Give the adapter + scale time after open before we cancel the first read()
	await new Promise((resolve) => setTimeout(resolve, 400))

	if (port.readable && port.readable.locked) {
		try {
			await port.close()
		} catch {
			// ignore
		}
		return { result: 'skip_locked' }
	}

	let currentReader = port.readable.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let validFrames = 0
	let rawDataReceived = ''
	let rawByteCount = 0

	const startTime = Date.now()
	try {
		while (Date.now() - startTime < probeMsPerCombo) {
			try {
				// Only one pending reader.read() at a time. On timeout, cancel + new reader — overlapping
				// read() calls (old pattern) break Chromium Web Serial and match no data.
				// While we have seen **no** bytes yet, wait longer before cancel — slow scales / drivers
				// often deliver the first chunk after a few seconds; 1.6s was too aggressive.
				const chunkMs = rawByteCount === 0 ? Math.min(8000, Math.max(readChunkMs, 4500)) : readChunkMs
				const raceResult = await Promise.race([
					currentReader.read().then((r) => ({ kind: 'read', r })),
					new Promise((resolve) => setTimeout(() => resolve({ kind: 'timeout' }), chunkMs)),
				])
				if (raceResult.kind === 'timeout') {
					try {
						await currentReader.cancel()
					} catch {
						// ignore
					}
					try {
						currentReader.releaseLock()
					} catch {
						// ignore
					}
					if (!port.readable) {
						break
					}
					try {
						currentReader = port.readable.getReader()
					} catch (e) {
						console.log(`    getReader after probe timeout failed:`, e && e.message ? e.message : e)
						break
					}
					continue
				}
				const { value, done } = raceResult.r
				if (done) break

				if (value && value.byteLength) {
					rawByteCount += value.byteLength
					const decoded = decoder.decode(value, { stream: true })
					buffer += decoded
					rawDataReceived += decoded

					if (rawDataReceived.length <= 100) {
						console.log(
							`    Raw (${portName} @ ${baudrate} ${dataBits}${shapeTag}):`,
							JSON.stringify(rawDataReceived)
						)
					}

					let scan = 0
					while (scan < buffer.length) {
						if (buffer[scan] === '=') {
							const parsed = parseWeightFrameAt(buffer, scan)
							if (parsed) {
								validFrames++
								console.log(
									`    ✅ Weight frame ${validFrames}/${PROBE_FRAMES_TO_CONFIRM} @ ${baudrate} ${dataBits}${shapeTag}`
								)
								if (validFrames >= PROBE_FRAMES_TO_CONFIRM) {
									port._detectedBaudrate = baudrate
									port._detectedParity = parity
									port._detectedStopBits = stopBits
									port._detectedDataBits = dataBits
									port._serialSignalPreset = signalPreset
									port._serialForceLineSignals = !!forceLineSignals
									port._rawSerialFallback = false
									try {
										currentReader.releaseLock()
									} catch {
										// ignore
									}
									return { result: 'weight', port }
								}
								scan += parsed.length
								continue
							}
						}
						scan++
					}

					if (buffer.length > 128) {
						buffer = buffer.slice(-128)
					}
				}
			} catch (e) {
				console.log(`    Read error @ ${baudrate} ${dataBits}${shapeTag}:`, e && e.message ? e.message : e)
				break
			}
		}
	} finally {
		try {
			currentReader.releaseLock()
		} catch {
			// ignore
		}
	}

	try {
		await port.close()
	} catch {
		// ignore
	}

	const sample = truncateForProbeLog(rawDataReceived)
	if (rawByteCount > 0) {
		console.log(
			`    ⚠️ ${rawByteCount} bytes, no valid "=" frames @ ${baudrate} ${dataBits}${shapeTag}`
		)
		if (typeof probeDebugLog === 'function') {
			probeDebugLog(
				`⚠️ ${portName} @ ${baudrate} ${dataBits}${shapeTag} [${signalPreset}]: ${rawByteCount} bytes, no "=" weight — sample: ${sample}`
			)
		}
	} else {
		console.log(`    ⚠️ No data @ ${baudrate} ${dataBits}${shapeTag}`)
		if (typeof probeDebugLog === 'function') {
			probeDebugLog(
				`⚠️ ${portName} @ ${baudrate} ${dataBits}${shapeTag} [${signalPreset}]: no bytes (silent / wrong line coding / scale not TX during probe).`
			)
		}
	}

	return {
		result: 'no_weight',
		byteCount: rawByteCount,
		sample,
		baudrate,
		parity,
		stopBits,
		dataBits,
		signalPreset,
		forceLineSignals: !!forceLineSignals,
	}
}

async function reopenPortLoose(
	port,
	baud,
	parity,
	stopBits,
	signalPreset,
	probeDebugLog,
	portName,
	dataBits = SCALE_SERIAL_SETTINGS.dataBits
) {
	try {
		if (port.readable && port.readable.locked) {
			return false
		}
		if (port.readable || port.writable) {
			await port.close()
			await new Promise((resolve) => setTimeout(resolve, 120))
		}
	} catch {
		// continue
	}
	try {
		await port.open({
			baudRate: baud,
			dataBits,
			parity,
			stopBits,
			flowControl: SCALE_SERIAL_SETTINGS.flowControl,
			bufferSize: 16384,
		})
	} catch (e) {
		if (typeof probeDebugLog === 'function') {
			probeDebugLog(`❌ Could not reopen ${portName} for raw mode: ${e && e.message ? e.message : e}`)
		}
		return false
	}
	const sig = signalPreset || 'dtr_rts_high'
	const forceSig = port._serialForceLineSignals === true
	await applySerialSignals(port, sig, WEB_SERIAL_USE_LINE_SIGNALS || forceSig)
	port._detectedBaudrate = baud
	port._detectedParity = parity
	port._detectedStopBits = stopBits
	port._detectedDataBits = dataBits
	port._serialSignalPreset = sig
	port._rawSerialFallback = true
	return true
}

export function detectStable(readings, required = 5) {
	if (readings.length < required) return null
	const base = Number(readings[readings.length - required].toFixed(3))
	for (let i = readings.length - required; i < readings.length; i++) {
		if (Number(readings[i].toFixed(3)) !== base) return null
	}
	return base
}

/** Rotate granted-port order each probe so no single device is always tested last */
let serialPortProbeAttempt = 0

// Real serial connection using Web Serial API - matches Python logic
// NOTE: This function is ONLY for web mode, NOT for Electron mode
// DO NOT CALL THIS IN ELECTRON MODE - it will throw errors
/** Optional probeDebugLog(msg) — surfaces raw samples in the UI Logs panel */
async function connectToRealDevice(
	forceNewPort = false,
	requireUserSelection = false,
	probeDebugLog = null,
	preselectedPort = null
) {
	// Check if we're in Electron mode - if so, throw error
	if (typeof window !== 'undefined' && window.nativeAPI) {
		throw new Error('Cannot use Web Serial API in Electron mode. Use IPC instead.')
	}
	
	// Check if Web Serial API is available (web mode only)
	if (typeof navigator === 'undefined' || !('serial' in navigator)) {
		throw new Error('Web Serial API not supported in this browser. Please use Chrome or Edge.')
	}
	
	const testBaudrates = WEB_PROBE_BAUD_RATES
	/** Slow scales / USB adapters: give each read() time before timing out */
	const READ_CHUNK_MS = 1600

	try {
		let ports = []

		// Port already chosen in the same click handler (Reconnect) — skip requestPort here.
		// Calling requestPort after await disconnectAll/setTimeout loses user activation; Chrome then shows no dialog.
		if (preselectedPort) {
			ports = [preselectedPort]
			console.log('Using pre-selected port from Reconnect (picker already shown)')
		} else {
		// Get available ports first (previously granted)
		const grantedPorts = await navigator.serial.getPorts()
		console.log('Previously granted ports:', grantedPorts.length)
		
		// Only request new port if explicitly required (user clicked button) or no granted ports exist
		if (requireUserSelection || (forceNewPort && grantedPorts.length === 0)) {
			// Request user to select a port (only when explicitly needed)
			console.log('Requesting new port selection (user action required)...')
			try {
				const newPort = await navigator.serial.requestPort(getWebSerialRequestPortOptions())
				
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
		}
		
		if (ports.length === 0) {
			throw new Error('No ports available. Device may need permission. Click "Reconnect" to grant access once, then it will auto-connect.')
		}

		ports = orderPortsForWeightProbe(ports)

		// Fair rotation only when we don't know which port was the scale yet (avoids always hitting printer first).
		if (ports.length > 1 && !readLastScaleUsbPref()) {
			serialPortProbeAttempt += 1
			const shift = serialPortProbeAttempt % ports.length
			ports = [...ports.slice(shift), ...ports.slice(0, shift)]
		}

		// One device: scales often send a line only when the platform moves / on a timer — 2.5s per baud was too short.
		const probeMsPerCombo =
			ports.length <= 1
				? 14000
				: Math.min(8000, 3200 + Math.max(0, ports.length - 1) * 550)
		if (typeof probeDebugLog === 'function') {
			const baudList = WEB_PROBE_BAUD_RATES.join(', ')
			const lineHint = WEB_SERIAL_USE_LINE_SIGNALS
				? ' DTR/RTS presets @ 9600 first;'
				: ' **No DTR/RTS overrides** (PuTTY-style defaults);'
			const soakHint =
				ports.length === 1
					? `${lineHint} then bauds **${baudList}** @ 8N1; if still silent, ~${Math.round((FINAL_SOAK_MS_PER_BAUD * FINAL_SOAK_BAUDS.length) / 1000)}s soak across **${FINAL_SOAK_BAUDS.join('/')}**. Move/load the platform during connect.`
					: ''
			const multi =
				ports.length > 1
					? ` **Auto-detect:** trying **${ports.length}** granted serial device(s) in priority order (last working scale → FTDI/CH340/CP210x → others). No need to pick which is which once each has been allowed in Chrome.`
					: ''
			probeDebugLog(
				`🔍 Probing ${ports.length} port(s): **8N1, handshaking none** @ **${baudList}** (~${Math.round(probeMsPerCombo / 1000)}s/combo, ${READ_CHUNK_MS}ms read slice).${soakHint}${multi}`
			)
		}

		let globalBest = {
			byteCount: 0,
			port: null,
			baud: SCALE_SERIAL_SETTINGS.baudRate,
			parity: SCALE_SERIAL_SETTINGS.parity,
			stopBits: SCALE_SERIAL_SETTINGS.stopBits,
			dataBits: SCALE_SERIAL_SETTINGS.dataBits,
			portName: '',
			signalPreset: 'dtr_rts_high',
		}

		const considerBestFrom = (r, port, pname) => {
			if (r.result !== 'no_weight') return
			if (r.byteCount > globalBest.byteCount) {
				port._serialForceLineSignals = !!r.forceLineSignals
				globalBest = {
					byteCount: r.byteCount,
					port,
					baud: r.baudrate,
					parity: r.parity,
					stopBits: r.stopBits,
					dataBits: r.dataBits != null ? r.dataBits : SCALE_SERIAL_SETTINGS.dataBits,
					portName: pname,
					signalPreset: r.signalPreset || 'dtr_rts_high',
				}
			}
		}

		let activeSignalPreset = 'dtr_rts_high'

		if (WEB_SERIAL_USE_LINE_SIGNALS && ports.length === 1) {
			const port = ports[0]
			const portName = formatSerialPortLabel(port)
			if (typeof probeDebugLog === 'function') {
				probeDebugLog(
					`🔌 **${SCALE_SERIAL_SETTINGS.baudRate} 8N1, no flow control**: four DTR/RTS line states (~5s each). Nudge the load so the scale may transmit.`
				)
			}
			let bestSweepBytes = 0
			let bestSweepPreset = 'dtr_rts_high'
			for (const preset of SERIAL_SIGNAL_PRESET_ORDER) {
				const r = await probeSerialCombo({
					port,
					baudrate: SCALE_SERIAL_SETTINGS.baudRate,
					parity: SCALE_SERIAL_SETTINGS.parity,
					stopBits: SCALE_SERIAL_SETTINGS.stopBits,
					probeMsPerCombo: 5000,
					readChunkMs: 1400,
					probeDebugLog,
					portName,
					signalPreset: preset,
				})
				if (r.result === 'weight') {
					console.log(`    ✅ Scale found @ 9600 (preset ${preset}). Using ${portName}`)
					return r.port
				}
				if (r.result === 'no_weight') {
					considerBestFrom(r, port, portName)
					if (r.byteCount > bestSweepBytes) {
						bestSweepBytes = r.byteCount
						bestSweepPreset = preset
					}
				}
			}
			activeSignalPreset = bestSweepBytes > 0 ? bestSweepPreset : 'dtr_rts_high'
			if (bestSweepBytes > 0 && typeof probeDebugLog === 'function') {
				probeDebugLog(
					`📌 Strongest 9600 activity with preset "${activeSignalPreset}" (${bestSweepBytes} bytes) — using it for the baud sweep.`
				)
			}
		}

		console.log(
			`Testing ${ports.length} port(s), ~${probeMsPerCombo}ms per combo, READ_CHUNK_MS=${READ_CHUNK_MS}, signal=${activeSignalPreset}...`
		)

		const runBaudSweepAndSoak = async (forceLineSignals) => {
			for (const port of ports) {
				const portName = formatSerialPortLabel(port)
				console.log(`Testing port: ${portName}${forceLineSignals ? ' (DTR/RTS on)' : ''}`)

				for (const baudrate of testBaudrates) {
					console.log(`  Testing ${portName} @ ${baudrate} 8N1...`)
					const r = await probeSerialCombo({
						port,
						baudrate,
						parity: SCALE_SERIAL_SETTINGS.parity,
						stopBits: SCALE_SERIAL_SETTINGS.stopBits,
						probeMsPerCombo,
						readChunkMs: READ_CHUNK_MS,
						probeDebugLog,
						portName,
						signalPreset: activeSignalPreset,
						forceLineSignals,
					})
					if (r.result === 'weight') {
						console.log(`    ✅ Scale found. Using ${portName} @ ${baudrate} baud (8N1)`)
						return r.port
					}
					if (r.result === 'no_weight') {
						considerBestFrom(r, port, portName)
					}
				}
			}

			if (globalBest.byteCount === 0 && ports.length === 1) {
				const port = ports[0]
				const portName = formatSerialPortLabel(port)
				if (typeof probeDebugLog === 'function') {
					probeDebugLog(
						`⏳ Final soak @ 8N1, no flow control: **${FINAL_SOAK_BAUDS.join(' → ')}** baud (~${Math.round(FINAL_SOAK_MS_PER_BAUD / 1000)}s each). ${SCALE_SERIAL_SETTINGS.baudRate} is tried first — load the platform so the scale may transmit.`
					)
				}
				for (const soakBaud of FINAL_SOAK_BAUDS) {
					const r = await probeSerialCombo({
						port,
						baudrate: soakBaud,
						parity: SCALE_SERIAL_SETTINGS.parity,
						stopBits: SCALE_SERIAL_SETTINGS.stopBits,
						probeMsPerCombo: FINAL_SOAK_MS_PER_BAUD,
						readChunkMs: 2400,
						probeDebugLog,
						portName,
						signalPreset: activeSignalPreset,
						forceLineSignals,
					})
					if (r.result === 'weight') {
						console.log(`    ✅ Scale found (final soak). Using ${portName} @ ${soakBaud} baud (8N1)`)
						return r.port
					}
					if (r.result === 'no_weight') {
						considerBestFrom(r, port, portName)
					}
					if (globalBest.byteCount > 0) {
						break
					}
				}
			}
			return null
		}

		let foundPort = await runBaudSweepAndSoak(false)
		if (foundPort) {
			return foundPort
		}

		if (globalBest.byteCount === 0 && !WEB_SERIAL_USE_LINE_SIGNALS) {
			if (typeof probeDebugLog === 'function') {
				probeDebugLog(
					'🔄 **No bytes** on the first pass (PuTTY-style, no line signals). Retrying once with **DTR+RTS high** — many USB–serial adapters only receive after those lines are driven.'
				)
			}
			globalBest = {
				byteCount: 0,
				port: null,
				baud: SCALE_SERIAL_SETTINGS.baudRate,
				parity: SCALE_SERIAL_SETTINGS.parity,
				stopBits: SCALE_SERIAL_SETTINGS.stopBits,
				dataBits: SCALE_SERIAL_SETTINGS.dataBits,
				portName: '',
				signalPreset: 'dtr_rts_high',
			}
			activeSignalPreset = 'dtr_rts_high'
			foundPort = await runBaudSweepAndSoak(true)
			if (foundPort) {
				return foundPort
			}
		}

		if (!foundPort && globalBest.byteCount === 0 && ports.length === 1) {
			const port = ports[0]
			const portName = formatSerialPortLabel(port)
			if (typeof probeDebugLog === 'function') {
				probeDebugLog(
					'🔄 **9600 7E1** (7 data bits, even parity) — some industrial indicators use this instead of 8N1; trying without then with DTR/RTS…'
				)
			}
			for (const forceLS of [false, true]) {
				const r = await probeSerialCombo({
					port,
					baudrate: 9600,
					parity: 'even',
					stopBits: 1,
					dataBits: 7,
					probeMsPerCombo: 16000,
					readChunkMs: READ_CHUNK_MS,
					probeDebugLog,
					portName,
					signalPreset: 'dtr_rts_high',
					forceLineSignals: forceLS,
				})
				if (r.result === 'weight') {
					console.log(`    ✅ Scale found @ 9600 7E1. Using ${portName}`)
					return r.port
				}
				if (r.result === 'no_weight') {
					considerBestFrom(r, port, portName)
				}
			}
		}

		if (globalBest.byteCount > 0) {
			const gb = globalBest
			const shape = `${gb.parity === 'none' ? 'N' : gb.parity === 'even' ? 'E' : 'O'}${gb.stopBits}`
			const db = gb.dataBits != null ? gb.dataBits : SCALE_SERIAL_SETTINGS.dataBits
			if (typeof probeDebugLog === 'function') {
				probeDebugLog(
					`✅ Opening ${gb.portName} @ ${gb.baud} ${db}${shape} (raw serial: ${gb.byteCount} bytes during probe, no "=" weight line). Check **Incoming data** for the real format.`
				)
			}
			const ok = await reopenPortLoose(
				gb.port,
				gb.baud,
				gb.parity,
				gb.stopBits,
				gb.signalPreset,
				probeDebugLog,
				gb.portName,
				db
			)
			if (ok) {
				return gb.port
			}
		}

		console.log('❌ No serial data found after all probes (or could not reopen port).')
		if (typeof probeDebugLog === 'function') {
			const passDesc = WEB_SERIAL_USE_LINE_SIGNALS
				? `DTR/RTS presets @ ${SCALE_SERIAL_SETTINGS.baudRate}, then `
				: `PuTTY-style (no DTR/RTS), optional **DTR+RTS retry**, then `
			probeDebugLog(
				`❌ Web Serial received **0 bytes** after: ${passDesc}full **8N1** baud sweep, final soak, **DTR/RTS** retry if used, and **9600 7E1** attempts (single port).`
			)
			probeDebugLog(
				`ℹ️ **Baud 9600 is already the first setting** — if your scale really is 9600 but logs stay “no bytes”, Chrome is almost certainly using the **wrong USB device** (e.g. Intel AMT COM vs **USB Serial / FTDI**), or **PuTTY** (etc.) still has the port. Reconnect and pick the same **COM#** as “USB Serial Port” in Device Manager.`
			)
			probeDebugLog(
				'🖥️ **Desktop app**: `npm run electron-dev` in `weight-dashboard` uses **native** serial — it often works when Chrome shows zero bytes.'
			)
			probeDebugLog(
				'🔧 RS232: TX/RX/GND crossed correctly; scale powered; load on platform during connect.'
			)
		}
		throw new Error(
			'No data reached the browser on any granted COM port (Web Serial).\n' +
				'The app already uses **9600 8N1 first**, then other common bauds — **zero bytes is not “wrong baud”** until at least one byte appears.\n' +
				'1. **Reconnect** and choose the **USB Serial / FTDI** COM that matches Device Manager (not Bluetooth / Intel AMT).\n' +
				'2. Close **PuTTY** and any app using that COM.\n' +
				'3. Run **`npm run electron-dev`** if Chrome never shows bytes.\n' +
				'4. Change `SCALE_SERIAL_SETTINGS.baudRate` / `serialManager.cjs` only if the manual specifies a different speed.'
		)
		
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
	const [serialLineCoding, setSerialLineCoding] = useState(null)
	const [logs, setLogs] = useState([])
	const [readings, setReadings] = useState([])
	const [stableWeight, setStableWeight] = useState(null)
	const [serialPreview, setSerialPreview] = useState('')
	const serialPreviewTailRef = useRef('')
	const lastSerialPreviewUiAtRef = useRef(0)
	const serialPortRef = useRef(null)
	const reconnectTimeoutRef = useRef(null)
	const isReconnectingRef = useRef(false)
	/** True while `requestPort()` dialog is open — avoids double dialogs on rapid clicks */
	const serialPickerActiveRef = useRef(false)
	const readerRef = useRef(null)
	const readingActiveRef = useRef(false)
	const electronModeRef = useRef(isElectron())
	const readingsHistoryRef = useRef([])
	/** Web-only: count failed auto-connects for exponential backoff */
	const webConnectFailCountRef = useRef(0)
	const lastWebVerboseErrorLogRef = useRef(0)

	const appendLog = useCallback((msg) => {
		setLogs((prev) => [msg, ...prev].slice(0, 50))
	}, [])

	useEffect(() => {
		if (status !== 'on') {
			setSerialPreview('')
			serialPreviewTailRef.current = ''
		}
	}, [status])

	// Electron: show what the UI is receiving (parsed kg), since raw serial stays in main process
	useEffect(() => {
		if (typeof window === 'undefined' || !window.nativeAPI || status !== 'on') return
		if (readings.length === 0) {
			setSerialPreview('(Waiting for first weight from the scale…)')
			return
		}
		const tail = readings
			.slice(-12)
			.map((r) => r.toFixed(3))
			.join(' → ')
		setSerialPreview(`Parsed values from scale (kg, newest last): ${tail}`)
	}, [readings, status])

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

	const connectToReal = async (forceNewPort = false, requireUserSelection = false, preselectedPort = null) => {
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
			setSerialLineCoding(null)
			return
		}
		
		try {
			setStatus('connecting')
			setSerialPreview('')
			serialPreviewTailRef.current = ''
			if (preselectedPort) {
				appendLog('🔌 Connecting to the COM port you selected…')
			} else if (requireUserSelection) {
				appendLog('🔌 Please select your device\'s COM port from the dialog...')
			} else {
				appendLog('🔌 Auto-connecting to device...')
			}
			console.log(
				'Starting connection process, forceNewPort:',
				forceNewPort,
				'requireUserSelection:',
				requireUserSelection,
				'preselected:',
				!!preselectedPort
			)
			
			const serialPort = await connectToRealDevice(
				forceNewPort,
				requireUserSelection,
				appendLog,
				preselectedPort
			)
			
			// Ensure port is ready before using it
			if (!serialPort || !serialPort.readable) {
				throw new Error('Port is not ready after connection test')
			}
			
			serialPortRef.current = serialPort
			
			const portInfo = serialPort.getInfo()
			const detectedBaud = serialPort._detectedBaudrate || SCALE_SERIAL_SETTINGS.baudRate
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
			const shape =
				serialPort._detectedParity === 'even'
					? 'E'
					: serialPort._detectedParity === 'odd'
						? 'O'
						: 'N'
			const sb = serialPort._detectedStopBits === 2 ? 2 : 1
			const db =
				serialPort._detectedDataBits != null
					? serialPort._detectedDataBits
					: SCALE_SERIAL_SETTINGS.dataBits
			const lineCodingShort =
				serialPort._detectedParity != null ||
				serialPort._detectedStopBits != null ||
				serialPort._detectedDataBits != null
					? `${db}${shape}${sb}`
					: '8N1'
			setSerialLineCoding(lineCodingShort)
			webConnectFailCountRef.current = 0
			saveLastSuccessfulScaleUsb(serialPort)
			const lineCoding =
				serialPort._detectedParity != null ||
				serialPort._detectedStopBits != null ||
				serialPort._detectedDataBits != null
					? ` ${lineCodingShort}`
					: ' 8N1'
			appendLog(`✅ Machine connected on ${portName} @ ${detectedBaud} baud${lineCoding}`)
			if (serialPort._rawSerialFallback) {
				appendLog(
					'⚠️ No "=" weight line was seen during setup — connected in raw mode. Use **Incoming data** to see the exact format; numeric parsing may need a protocol tweak.'
				)
			}
			appendLog(
				'💡 When ON, the Live Weight page shows a sample of incoming data below Port/Baud. If you change the scale baud or mode, click Reconnect. Refreshing the page is enough to retry; restarting the app is only needed if the app itself misbehaves.'
			)
			
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
						const decoded = decoder.decode(value, { stream: true })
						buffer += decoded

						if (!electronModeRef.current) {
							serialPreviewTailRef.current = (serialPreviewTailRef.current + decoded).slice(-240)
							const now = Date.now()
							if (now - lastSerialPreviewUiAtRef.current > 350) {
								lastSerialPreviewUiAtRef.current = now
								setSerialPreview(serialPreviewTailRef.current)
							}
						}

						let consumeUntil = 0
						let scan = 0
						while (scan < buffer.length) {
							if (buffer[scan] === '=') {
								const parsed = parseWeightFrameAt(buffer, scan)
								if (parsed) {
									const kg = parsed.kg
									const frame = buffer.slice(scan, scan + parsed.length)
									setStatus((currentStatus) => {
										if (currentStatus !== 'on' && serialPortRef.current === serialPort) {
											return 'on'
										}
										return currentStatus
									})

									setReadings((prev) => {
										const newReadings = [...prev.slice(-49), kg]
										const stable = detectStable(newReadings, 5)
										if (stable !== null && stable !== undefined) {
											queueMicrotask(() => setStableWeight(stable))
										}
										return newReadings
									})
									appendLog(`Reading: ${kg.toFixed(3)} kg  |  ${frame}`)
									consumeUntil = scan + parsed.length
									scan += parsed.length
									continue
								}
							}
							scan++
						}

						if (consumeUntil > 0) {
							buffer = buffer.slice(consumeUntil)
						} else if (buffer.length > 256) {
							buffer = buffer.slice(-128)
						}
					}
					} catch (readError) {
						const errMsg =
							readError != null && typeof readError.message === 'string'
								? readError.message
								: String(readError)
						const readableLocked =
							serialPort.readable && typeof serialPort.readable.locked === 'boolean'
								? serialPort.readable.locked
								: true
						const isRecoverableError =
							errMsg.includes('timeout') ||
							errMsg.includes('The operation was aborted') ||
							!readableLocked

						if (isRecoverableError && readingActiveRef.current && serialPortRef.current === serialPort) {
							await new Promise(resolve => setTimeout(resolve, 100))
							continue
						}

						appendLog(`❌ Read error: ${errMsg}`)
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
				readingActiveRef.current = false
				const errMsg =
					error != null && typeof error.message === 'string' ? error.message : String(error)
				appendLog(`❌ Read loop error: ${errMsg}`)
				
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
			setSerialLineCoding(null)
			
			// Electron mode: Do not auto-reconnect using Web Serial API
			if (electronModeRef.current && window.nativeAPI) {
				appendLog(`❌ Connection error: ${error.message}`)
				appendLog('💡 Main process will handle reconnection automatically')
				return
			}
			
			// Web mode: backoff + throttled logs (avoid spam when scale unplugged or wrong port)
			if (!isReconnectingRef.current) {
				webConnectFailCountRef.current += 1
				const n = webConnectFailCountRef.current
				const delayMs = Math.min(60000, Math.round(3500 * Math.pow(1.4, Math.min(n - 1, 9))))
				const now = Date.now()
				const verbose =
					n === 1 || now - lastWebVerboseErrorLogRef.current > 40000
				if (verbose) {
					lastWebVerboseErrorLogRef.current = now
					appendLog(`❌ Connection error: ${error.message}`)
					appendLog(
						'💡 Tip: **9600 8N1 is already used first.** “No bytes” usually means Chrome has the **wrong** COM (pick **USB Serial / FTDI**, not Intel AMT) or PuTTY holds the port. **Reconnect** → match Device Manager. Then try **`npm run electron-dev`** if still silent.'
					)
					appendLog(
						`🔄 Auto-retry in ${Math.round(delayMs / 1000)}s — all granted ports are scanned each time.`
					)
				} else {
					appendLog(
						`⏳ No scale yet (try ${n}). Next scan in ${Math.round(delayMs / 1000)}s — use Reconnect to choose the scale port.`
					)
				}
				isReconnectingRef.current = true
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current)
				}
				reconnectTimeoutRef.current = setTimeout(() => {
					isReconnectingRef.current = false
					connectToReal(false, false)
				}, delayMs)
			}
		}
	}

	const reconnect = useCallback(async () => {
		const isElectronMode = typeof window !== 'undefined' && window.nativeAPI

		// Cancel scheduled auto-retry first. It sets `isReconnectingRef` true for the *entire* backoff
		// (several seconds to a minute) — if we don't clear that, Reconnect returned early and never
		// called `requestPort()`, so the port picker never appeared.
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}
		isReconnectingRef.current = false

		webConnectFailCountRef.current = 0

		// Electron: full UI reset, then IPC (no Web Serial picker)
		if (isElectronMode && window.nativeAPI && window.nativeAPI.requestReconnect) {
			isReconnectingRef.current = true
			setStatus('connecting')
			setPort(null)
			setBaud(null)
			setSerialLineCoding(null)
			setReadings([])
			setStableWeight(null)
			setLogs([])
			await new Promise((resolve) => setTimeout(resolve, 10))
			appendLog('🔄 Manual reconnect requested (full reset like Ctrl+R)...')
			electronModeRef.current = true
			try {
				appendLog('🔄 Requesting weight machine reconnection via main process...')
				await window.nativeAPI.requestReconnect()
				appendLog('✅ Reconnection request sent to main process')
				appendLog('💡 Main process will scan and connect to weight machine')
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

		// Web Serial: show port picker on the *first* await after click — not after disconnect/delays
		// (Chrome requires a user gesture; setTimeout/disconnectAll in between suppresses the dialog).
		if (typeof navigator === 'undefined' || !('serial' in navigator)) {
			appendLog('❌ Web Serial API not supported. Use Chrome or Edge.')
			setStatus('off')
			return
		}

		if (serialPickerActiveRef.current) {
			appendLog('⏳ A port dialog is already open — finish or cancel it, then click Reconnect again.')
			return
		}

		let preselectedPort = null
		serialPickerActiveRef.current = true
		try {
			preselectedPort = await navigator.serial.requestPort(getWebSerialRequestPortOptions())
		} catch (err) {
			console.log('Port selection error:', err && err.message, err && err.name)
			setStatus('off')
			if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
				appendLog(
					'❌ Port picker was cancelled or blocked. Click **Reconnect** again and allow access if the browser asks.'
				)
			} else {
				appendLog(`❌ Port selection failed: ${err && err.message ? err.message : String(err)}`)
			}
			return
		} finally {
			serialPickerActiveRef.current = false
		}

		isReconnectingRef.current = true
		electronModeRef.current = false
		setStatus('connecting')
		setPort(null)
		setBaud(null)
		setSerialLineCoding(null)
		setReadings([])
		setStableWeight(null)
		setLogs([])
		appendLog('🔄 Manual reconnect — closing old sessions, then opening the port you chose…')

		try {
			await disconnectAll()
			await new Promise((resolve) => setTimeout(resolve, 300))
			await connectToReal(false, false, preselectedPort)
			isReconnectingRef.current = false
		} catch (e) {
			console.error('Error during reconnect:', e)
			appendLog(`❌ Reconnection error: ${e.message}`)
			isReconnectingRef.current = false
			setTimeout(async () => {
				if (isReconnectingRef.current) return
				isReconnectingRef.current = true
				try {
					appendLog('🔄 Retrying with the same selected port…')
					await disconnectAll()
					await new Promise((resolve) => setTimeout(resolve, 300))
					await connectToReal(false, false, preselectedPort)
					isReconnectingRef.current = false
				} catch (retryError) {
					appendLog(`❌ Retry failed: ${retryError.message}`)
					setStatus('off')
					isReconnectingRef.current = false
				}
			}, 2000)
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
		if (typeof window === 'undefined' || !window.nativeAPI?.onWeightLive) {
			return
		}
		electronModeRef.current = true

		const handleWeightLive = (weight) => {
			const kg = parseFloat(weight)
			if (!isNaN(kg) && isFinite(kg)) {
				setReadings((prev) => {
					const newReadings = [...prev.slice(-49), kg]
					const stable = detectStable(newReadings, 5)
					if (stable !== null && stable !== undefined) {
						queueMicrotask(() => setStableWeight(stable))
					}
					return newReadings
				})
				appendLog(`Reading: ${kg.toFixed(3)} kg`)
				setStatus('on')
			}
		}

		window.nativeAPI.onWeightLive(handleWeightLive)

		return () => {
			if (window.nativeAPI?.removeWeightLiveListener) {
				window.nativeAPI.removeWeightLiveListener()
			}
		}
	}, [appendLog])

	// Listen to stable weight readings from main process
	useEffect(() => {
		if (typeof window === 'undefined' || !window.nativeAPI?.onWeightStable) {
			return
		}
		electronModeRef.current = true

		const handleWeightStable = (weight) => {
			const kg = parseFloat(weight)
			if (!isNaN(kg) && isFinite(kg)) {
				setStableWeight(kg)
				appendLog(`✅ Stable weight: ${kg.toFixed(3)} kg`)
			}
		}

		window.nativeAPI.onWeightStable(handleWeightStable)

		return () => {
			if (window.nativeAPI?.removeWeightStableListener) {
				window.nativeAPI.removeWeightStableListener()
			}
		}
	}, [appendLog])

	// Listen to connection status updates from main process
	useEffect(() => {
		if (typeof window === 'undefined' || !window.nativeAPI?.onSerialStatus) {
			return
		}
		electronModeRef.current = true

		const handleSerialStatus = (statusData) => {
			const { status, port, baud: ipcBaud, lineCoding: ipcLine } = statusData
			console.log('[useSerialConnection] Serial status update:', status, port, ipcBaud, ipcLine)

			if (status === 'connecting') {
				setStatus('connecting')
				if (port) {
					setPort(port)
				}
				if (ipcBaud != null) {
					setBaud(ipcBaud)
				}
				if (ipcLine != null) {
					setSerialLineCoding(ipcLine)
				}
			} else if (status === 'connected') {
				setStatus('on')
				if (port) {
					setPort(port)
				}
				setBaud(ipcBaud != null ? ipcBaud : SCALE_SERIAL_SETTINGS.baudRate)
				setSerialLineCoding(ipcLine != null ? ipcLine : '8N1')
			} else if (status === 'disconnected') {
				setStatus('off')
				setPort(null)
				setBaud(null)
				setSerialLineCoding(null)
			}
		}

		window.nativeAPI.onSerialStatus(handleSerialStatus)

		return () => {
			if (window.nativeAPI?.removeSerialStatusListener) {
				window.nativeAPI.removeSerialStatusListener()
			}
		}
	}, [])

	// Listen to detailed serial logs from main process
	useEffect(() => {
		if (typeof window === 'undefined' || !window.nativeAPI?.onSerialLog) {
			return
		}
		electronModeRef.current = true

		const handleSerialLog = (logData) => {
			const { message } = logData
			appendLog(message)
		}

		window.nativeAPI.onSerialLog(handleSerialLog)

		return () => {
			if (window.nativeAPI?.removeSerialLogListener) {
				window.nativeAPI.removeSerialLogListener()
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
					appendLog(`✅ Found ${grantedPorts.length} previously granted serial device(s)`)
					if (grantedPorts.length > 1) {
						appendLog(
							'💡 **Auto-detect:** we probe every allowed device and use the one that sends weight (`=…`). Order: last working scale → common USB-serial chips (FTDI/CH340/CP210x) → others.'
						)
					}
					appendLog('🔄 Auto-connecting (no port picker unless you use Reconnect)…')
					// Small delay to let UI update
					await new Promise(resolve => setTimeout(resolve, 300))
					connectToReal(false, false) // Auto-connect, no user selection needed
				} else {
					appendLog('ℹ️ No previously granted ports found')
					appendLog(
						'💡 Click **Reconnect** and choose your **scale’s USB serial** port. Chrome must allow each device once; if you also use printer/scanner serial, reconnect once per cable so all are allowed — then we auto-pick the scale by data.'
					)
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

	return { status, port, baud, serialLineCoding, logs, readings, stableWeight, reconnect, serialPreview }
}


