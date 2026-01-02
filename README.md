# Industrial Weight Ticket System

Desktop application for real-time weight monitoring and fabric roll ticket generation. Built with React, Electron, and Vite. Connects to weighing indicators via serial port, displays live weight data, generates professional tickets with QR codes, and maintains comprehensive weight history for textile manufacturing operations.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Python Serial Connection](#python-serial-connection)
- [Desktop Application](#desktop-application)
- [License](#license)

## Overview

This project consists of two main components:

1. **Python Serial Connection Program** - Connects to Yaohua YH-T7E weighing indicator via RS232
2. **Electron Desktop Application** - Full-featured weight monitoring and ticket generation system

## Features

### Desktop Application
- **Real-time weight monitoring** from YH-T7E Weighing Indicator
- **Auto-scan serial ports** with multiple baud rate testing
- **Stable value detection** (5 consecutive readings)
- **Fabric roll ticket creation** with professional layout
- **QR code generation** with all ticket data
- **Weight history tracking** and management
- **Google Drive integration** for data backup
- **Print functionality** with formatted output

### Python Serial Connection
- **Automatic Port Scanning**: Scans all available serial ports to find the connected device
- **Real-time Weight Display**: Continuously displays weight readings from the device
- **Status Monitoring**: Detects when the machine is ON, OFF, or disconnected
- **Configurable Settings**: Adjustable baudrate and timeout settings
- **Robust Error Handling**: Graceful handling of connection issues and timeouts

## Installation

### Prerequisites
- Python 3.6 or higher
- Node.js (v16 or higher)
- npm or yarn
- USB-to-RS232 adapter
- Yaohua YH-T7E weighing indicator

### Python Dependencies

1. Install the required Python dependencies:
```bash
pip install -r requirements.txt
```

### Desktop Application Dependencies

1. Navigate to the weight-dashboard directory:
```bash
cd weight-dashboard
```

2. Install Node.js dependencies:
```bash
npm install
```

## Usage

### Python Serial Connection Program

1. Connect your YH-T7E weighing indicator to the computer via USB-to-RS232 adapter
2. Ensure the device is powered on
3. Run the program:
```bash
python yh_t7e_weighing_indicator.py
```

### Desktop Application

1. Start development server:
```bash
cd weight-dashboard
npm run dev
```

2. For Electron desktop app:
```bash
npm run electron-dev
```

3. Build for production:
```bash
npm run build
npm run electron-build
```

## Python Serial Connection

### Configuration

The program uses the following default settings:
- **Baudrate**: 9600 bps
- **Data bits**: 8
- **Parity**: None
- **Stop bits**: 1
- **Timeout**: 1 second

To modify these settings, edit the `YH_T7E_WeighingIndicator` initialization in the `main()` function:

```python
weighing_indicator = YH_T7E_WeighingIndicator(baudrate=9600, timeout=1.0)
```

### Data Format

The YH-T7E sends ASCII strings in the following format:
- Always starts with `=`
- Followed by 6 characters representing weight and sign
- Format: `=XX.XXX+` or `=XX.XXX-`

Examples:
- `=00.0050` → 500.00 kg
- `=00.005-` → -500.00 kg

### Expected Output

#### When device is connected and powered on:
```
Yaohua YH-T7E Weighing Indicator Connection Program
==================================================
Scanning ports...
Found 3 port(s): COM1, COM3, COM5
Testing COM1...
Testing COM3...
Machine connected on COM3
Status: ON
Weight: 500.00 kg
Weight: 500.05 kg
Weight: 499.98 kg
...
```

#### When device is not found:
```
Yaohua YH-T7E Weighing Indicator Connection Program
==================================================
Scanning ports...
Found 2 port(s): COM1, COM2
Testing COM1...
Testing COM2...
Machine not connected
Status: DISCONNECTED
```

#### When device is powered off:
```
Status: OFF
Machine is OFF
```

## Desktop Application

### Technical Stack
- **React 18** with functional components and hooks
- **Electron** for desktop packaging
- **Vite** for fast development and building
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Serial Port** integration for device communication
- **Google APIs** for Drive integration

### Project Structure
```
weight-dashboard/
├── src/
│   ├── components/      # React components
│   ├── pages/          # Application pages
│   ├── hooks/          # Custom React hooks
│   ├── context/        # React context providers
│   └── utils/          # Utility functions
├── main/               # Electron main process files
├── dist/               # Build output
└── weightdata/         # Local data storage
```

## Troubleshooting

### Serial Connection Issues
1. **"No serial ports found"**: Ensure your USB-to-RS232 adapter is properly connected and drivers are installed
2. **"Machine not connected"**: 
   - Verify the device is powered on
   - Check that no other software is using the serial port
   - Try a different USB port
   - Verify the adapter is working with other devices
3. **"Machine is OFF"**: The device is connected but not sending data (likely powered off)

### Desktop Application Issues
1. Ensure all dependencies are installed: `npm install`
2. Check Node.js version compatibility
3. Clear cache and reinstall if needed: `rm -rf node_modules && npm install`

## Stopping the Program

Press `Ctrl+C` to stop the program gracefully.

## License

This program is provided as-is for educational and commercial use.
