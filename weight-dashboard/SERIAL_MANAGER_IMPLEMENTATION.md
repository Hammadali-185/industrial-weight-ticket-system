# Serial Manager Implementation Summary

## Overview
Replaced all Web Serial API logic with a robust Node-based serial manager in the Electron main process. The system now handles automatic detection, reading, reconnection, and local persistence entirely through Node.js `serialport` package.

## Files Created/Modified

### 1. `main/serialManager.js` (NEW)
- **Purpose**: Centralized serial port management in main process
- **Features**:
  - Auto-detects and connects to weight machine (9600 baud)
  - Parses weight frames (format: `=500.250\r\n`)
  - Detects stable weights (5 consecutive identical readings)
  - Auto-reconnects every 3 seconds on disconnect
  - Appends stable weights to `C:\WeightAppData\history.json` (JSON lines)
  - Logs all events to daily log files in `C:\WeightAppData\logs\YYYY-MM-DD.log`
  - Emits IPC events: `weight-live` and `weight-stable`

### 2. `main.cjs` (MODIFIED)
- **Removed**: All Web Serial API code, old serial port handling
- **Added**: 
  - Import and initialization of `serialManager`
  - IPC handler for `request-reconnect`
  - IPC handlers for `read-history` and `save-history` (handles both JSON lines and JSON array formats)

### 3. `preload.cjs` (MODIFIED)
- **Removed**: Old `electronAPI` references
- **Added**: 
  - `onWeightLive(callback)` - Listen to all weight readings
  - `onWeightStable(callback)` - Listen to stable weight values
  - `requestReconnect()` - Trigger manual reconnect
  - `readHistory()` and `saveHistory()` - For UI lists

### 4. `src/hooks/useSerialConnection.js` (MODIFIED)
- **Updated**: 
  - Uses `nativeAPI.onWeightLive()` for live readings
  - Uses `nativeAPI.onWeightStable()` for stable values
  - Uses `nativeAPI.requestReconnect()` for manual reconnect
  - Removed Web Serial API code (kept for web fallback)

## Data Flow

### Weight Reading Flow:
```
Weight Machine (COM Port)
  ↓ Serial Data: "=500.250\r\n"
serialManager.js (main process)
  ↓ Parse frame → 500.250 kg
  ↓ Check stability (5 consecutive)
  ↓ If stable: save to history.json + emit 'weight-stable'
  ↓ Always: emit 'weight-live'
IPC Event: 'weight-live' / 'weight-stable'
  ↓
preload.cjs (contextBridge)
  ↓
React Hook: useSerialConnection
  ↓
WeightContext
  ↓
UI Components (WeightDisplay, etc.)
```

### Storage Format:

**Weight Readings** (append-only JSON lines):
```json
{"timestamp": "2025-11-05T12:34:56Z", "weight": 500.250}
{"timestamp": "2025-11-05T12:34:57Z", "weight": 500.250}
{"timestamp": "2025-11-05T12:34:58Z", "weight": 500.251}
```

**UI Lists** (JSON array):
```json
[
  {
    "id": 1234567890,
    "name": "John Doe",
    "scannedList": [...],
    "totals": {...}
  }
]
```

## Key Features

### 1. Auto-Detection
- Scans all available COM ports on startup
- Tests each port for weight data (waits up to 2 seconds)
- Connects to first port that sends valid weight frames
- Continues scanning if no device found

### 2. Auto-Reconnection
- Automatically reconnects every 3 seconds on disconnect
- Works in background even if window is minimized
- Logs all reconnection attempts to daily log file

### 3. Stability Detection
- Requires 5 consecutive identical readings (rounded to 3 decimals)
- Only stable weights are saved to history file
- Both live and stable weights are emitted via IPC

### 4. Logging
- Daily log files: `C:\WeightAppData\logs\YYYY-MM-DD.log`
- Logs: connection attempts, successful connections, disconnections, parse errors
- Format: `[TIMESTAMP] [LEVEL] MESSAGE`

### 5. Persistence
- Stable weights appended to `C:\WeightAppData\history.json`
- Each record: `{"timestamp": "ISO8601", "weight": 500.250}`
- Append-only mode (never overwrites previous entries)

## IPC Events

### From Main Process to Renderer:
- `weight-live` - Emitted for every valid weight reading
- `weight-stable` - Emitted when 5 consecutive identical readings detected

### From Renderer to Main Process:
- `request-reconnect` - Trigger manual reconnection scan

## Configuration

All settings in `serialManager.js`:
- `BAUD_RATE = 9600`
- `DATA_BITS = 8`
- `STOP_BITS = 1`
- `PARITY = 'none'`
- `STABILITY_THRESHOLD = 5`
- `RECONNECT_DELAY = 3000` (3 seconds)

## Testing

1. **Start the app**: `npm run electron`
2. **Check logs**: `C:\WeightAppData\logs\YYYY-MM-DD.log`
3. **Check history**: `C:\WeightAppData\history.json`
4. **Test reconnect**: Click "Reconnect Weight Machine" button
5. **Test disconnect**: Unplug weight machine, verify auto-reconnect after 3 seconds

## Notes

- **No Web Serial API**: All serial I/O is through Node.js `serialport` in main process only
- **No browser backend**: App runs 100% standalone
- **QR scanner and printer**: Unchanged (standard OS devices)
- **Resilience**: Continues reconnecting in background even if window minimized
- **No popup alerts**: Errors only logged, connection status via UI indicator

