# Weight Dashboard — Electron desktop app

The same React + Vite app runs inside **Electron** with a native main process, preload bridge, file storage, optional **serial** weight streaming, and **Google Drive** backup from the main process.

## Layout

| Piece | Role |
|--------|------|
| `main.cjs` | Electron main: window, IPC, history/payments/listings files, Google Drive hooks |
| `preload.cjs` | Exposes `window.nativeAPI` (IPC only; context isolation on) |
| `main/serialManager.cjs` | COM port / scale integration in the desktop build |
| `main/googleDriveService.cjs` | OAuth + Drive sync from main |

The renderer detects Electron via `window.nativeAPI` and uses file-backed storage and native serial events when present; in a normal browser it uses **Web Serial** and `localStorage` for history.

## Run in development

From the `weight-dashboard` folder:

```bash
npm install
npm run electron-dev
```

This starts Vite on `http://localhost:5173` and launches Electron when the dev server is ready. If you only run `npm run electron` without Vite, Electron will use a **production** build from `dist/` if it exists (see below).

## Build the web assets, then the desktop installer

```bash
npm run build
npm run electron-build
```

- Vite writes the SPA to **`dist/`** (HTML/JS/CSS).
- **electron-builder** writes installers under **`release/`** (NSIS `.exe` on Windows). This output folder is separate from Vite’s `dist/` so builds do not overwrite each other.

Windows one-liner (cmd-style env, as in `package.json`):

```bash
npm run build:win
```

## Packaged app without installer (folder build)

```bash
npm run electron-pack
```

Inspect the unpacked app under `release/`.

## Data on disk (Electron)

History, listings, logs, and payments are stored under a **`weightdata`** folder next to the app executable when packaged, or under **`weightdata`** in the project root during development (see `getDataDir()` in `main.cjs`).

## Native modules

`serialport` (and `@serialport/*`) are unpacked from the ASAR archive so native bindings load correctly in the packaged app (`asarUnpack` in `package.json`).

## Troubleshooting

- **Blank window**: Run `npm run electron-dev`, or run `npm run build` then `npm run electron`.
- **Serial / COM issues**: Use Device Manager to confirm ports; check the main process log in the terminal that started Electron.
- **Code signing / winCodeSign**: The project disables strict signing discovery for local builds (`CSC_IDENTITY_AUTO_DISCOVERY=false` in scripts). Adjust for production signing if you publish the app.
