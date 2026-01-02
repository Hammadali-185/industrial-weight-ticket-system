# Yaohua YH-T7E Weighing Indicator RS232 Connection

This Python program automatically connects to a Yaohua YH-T7E weighing indicator via RS232 (USB-to-RS232 adapter) and displays real-time weight data.

## Features

- **Automatic Port Scanning**: Scans all available serial ports to find the connected device
- **Real-time Weight Display**: Continuously displays weight readings from the device
- **Status Monitoring**: Detects when the machine is ON, OFF, or disconnected
- **Configurable Settings**: Adjustable baudrate and timeout settings
- **Robust Error Handling**: Graceful handling of connection issues and timeouts

## Requirements

- Python 3.6 or higher
- USB-to-RS232 adapter
- Yaohua YH-T7E weighing indicator
- pyserial library

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Connect your YH-T7E weighing indicator to the computer via USB-to-RS232 adapter
2. Ensure the device is powered on
3. Run the program:
```bash
python yh_t7e_weighing_indicator.py
```

## Expected Output

### When device is connected and powered on:
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

### When device is not found:
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

### When device is powered off:
```
Status: OFF
Machine is OFF
```

## Configuration

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

## Data Format

The YH-T7E sends ASCII strings in the following format:
- Always starts with `=`
- Followed by 6 characters representing weight and sign
- Format: `=XX.XXX+` or `=XX.XXX-`

Examples:
- `=00.0050` → 500.00 kg
- `=00.005-` → -500.00 kg

## Troubleshooting

1. **"No serial ports found"**: Ensure your USB-to-RS232 adapter is properly connected and drivers are installed
2. **"Machine not connected"**: 
   - Verify the device is powered on
   - Check that no other software is using the serial port
   - Try a different USB port
   - Verify the adapter is working with other devices
3. **"Machine is OFF"**: The device is connected but not sending data (likely powered off)

## Stopping the Program

Press `Ctrl+C` to stop the program gracefully.

## License

This program is provided as-is for educational and commercial use.
















