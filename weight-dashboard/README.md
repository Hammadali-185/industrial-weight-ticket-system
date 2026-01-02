# 🧵 Saqib Silk Industry Dashboard

A modern React + Vite application for weight monitoring and ticket generation for Saqib Silk Industry.

## 🌟 Features

### 📊 Live Weight Dashboard
- **Real-time weight monitoring** from YH-T7E Weighing Indicator
- **Auto-scan serial ports** with multiple baud rate testing
- **Stable value detection** (5 consecutive readings)
- **Connection status indicators** with visual feedback
- **System logs** for debugging and monitoring

### 🏷️ Ticket Generator
- **Fabric roll ticket creation** with professional layout
- **Auto-fetch gross weight** from Live Weight page
- **Flexible net weight calculation** (percentage or fixed)
- **QR code generation** with all ticket data
- **Print functionality** with formatted output
- **Persistent form data** using localStorage
- **Industry-standard design** with yellow header and structured layout

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Chrome/Edge browser (for Web Serial API)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - Navigate to `http://localhost:5173`
   - Use Chrome or Edge for Web Serial API support

### Build for Production

```bash
npm run build
```

## 🔧 Technical Details

### Architecture
- **React 18** with functional components and hooks
- **Vite** for fast development and building
- **React Router** for navigation between pages
- **Tailwind CSS** for styling
- **Web Serial API** for serial communication
- **QRCode.react** for QR code generation

### File Structure
```
src/
├── components/
│   ├── Header.jsx          # App header with status
│   ├── WeightDisplay.jsx   # Weight display component
│   ├── LogsPanel.jsx       # System logs panel
│   └── Navbar.jsx          # Navigation bar
├── pages/
│   ├── LiveWeight.jsx      # Live weight monitoring page
│   └── TicketGenerator.jsx # Ticket generation page
├── hooks/
│   └── useSerialConnection.js # Serial communication logic
├── context/
│   └── WeightContext.jsx   # Global weight state management
└── App.jsx                 # Main app component
```

### Key Components

#### WeightContext
- Manages global weight state across pages
- Provides connection status updates
- Enables data sharing between Live Weight and Ticket Generator

#### useSerialConnection Hook
- Handles serial port scanning and connection
- Parses YH-T7E weight data frames
- Implements stable value detection
- Manages connection lifecycle

#### Ticket Generator
- Form with persistent localStorage data
- Real-time weight integration
- QR code generation with ticket data
- Print-ready formatted output

## 🖥️ Desktop App Packaging

This app is designed to be easily packaged as a desktop application:

### Electron
```bash
npm install electron electron-builder --save-dev
# Add electron configuration
npm run build
npm run electron:build
```

### Tauri
```bash
npm install @tauri-apps/cli
npx tauri init
npm run tauri build
```

## 📱 Browser Compatibility

- **Chrome/Edge**: Full Web Serial API support
- **Firefox**: Limited serial support
- **Safari**: No serial support

## 🔌 Hardware Requirements

- **YH-T7E Weighing Indicator** connected via USB-to-RS232 adapter
- **Supported baud rates**: 9600, 19200, 115200, 4800, 38400
- **Data format**: `=DDD.DDD` or `=DD.DDD[sign]` frames

## 🎨 Customization

### Styling
- Modify `tailwind.config.js` for theme customization
- Update color schemes in component files
- Add custom CSS in `src/index.css`

### Branding
- Update company name in `Navbar.jsx` and `TicketGenerator.jsx`
- Modify contact information in ticket template
- Change logo/icon in header components

## 🐛 Troubleshooting

### Serial Connection Issues
1. Ensure device is connected and powered on
2. Check browser permissions for serial access
3. Try different USB ports
4. Verify baud rate settings

### Print Issues
1. Check browser print settings
2. Ensure popup blockers are disabled
3. Verify printer is connected and ready

### Build Issues
1. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
2. Check Node.js version compatibility
3. Verify all dependencies are installed

## 📄 License

This project is proprietary software for Saqib Silk Industry.

## 🤝 Support

For technical support or feature requests, contact the development team.















