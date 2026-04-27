![Status](https://img.shields.io/badge/status-mvp--slice--1-blue)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

# hush-desktop

Electron desktop shell for [Hush](https://gethush.live) — an end-to-end encrypted communication platform.

Wraps `hush-web` in a hardened Electron shell. All cryptographic work remains in `hush-web`; this package adds the native app lifecycle, secure renderer loading, and the OS-boundary preload bridge.

---

## Running locally (macOS)

### Prerequisites

- Node.js 20+ and npm
- `hush-web` and `hush-server` dependencies installed and buildable

### Development (live dev server)

```sh
# Terminal 1: start hush-web dev server
cd ../hush-web
npm install
npm run dev   # starts on http://localhost:5173

# Terminal 2: start Electron shell
cd ../hush-desktop
npm install
npm run dev
```

The Electron window loads `http://localhost:5173` in dev mode. DevTools opens automatically.

Override the dev server URL if needed:

```sh
HUSH_WEB_URL=http://localhost:5173 npm run dev
```

### Production build and package (macOS)

```sh
# 1. Build hush-web
cd ../hush-web && npm run build && cd ../hush-desktop

# 2. Build main/preload and copy renderer assets
npm run build
npm run copy-renderer

# 3. Package (produces .dmg and .zip in dist/)
npm run dist:mac
```

### Tests

```sh
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

---

## Architecture

| Layer | Location | Responsibility |
|-|-|-|
| Main process | `src/main/` | App lifecycle, BrowserWindow, IPC handlers, protocol |
| Preload bridge | `src/preload/` | Explicit contextBridge surface — no generic invoke |
| Shared types | `src/shared/` | IPC channel constants and DesktopApi interface |
| Renderer | external (`hush-web`) | All product UI and crypto logic |

### Security defaults

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- All external link clicks redirected to OS browser via `setWindowOpenHandler`
- Production renderer served via custom `app://` protocol with COOP/COEP/CORP headers for WASM isolation
- Path traversal guard on all `app://` file requests

### Preload surface (current)

```ts
window.hushDesktop.isDesktop        // true
window.hushDesktop.platform         // process.platform
window.hushDesktop.getAppVersion()  // string via IPC
```

No vault key access in the renderer. That boundary is explicitly deferred to the next slice.

---

## Technology

| Component | Choice |
|-|-|
| Shell | [Electron](https://www.electronjs.org/) ^34 |
| Build | [electron-vite](https://electron-vite.org/) |
| Packaging | [electron-builder](https://www.electron.build/) |
| Auto-update | electron-updater (wired in next slice) |
| Keychain | keytar (wired in next slice — vault PIN storage) |

---

## Deferred (next slice)

- **Vault wrapping key via OS keychain**: `keytar` integration for macOS Keychain / Windows Credential Store / libsecret. The IPC channel shape is reserved in `src/shared/ipc-channels.ts`; the renderer must never hold key material directly.
- **Auto-update wiring**: `electron-updater` is installed; the update check and event handlers are not yet registered.
- **App icons**: place `icon.icns` (mac), `icon.ico` (win), `icon.png` (linux) in `build/icons/` before packaging.
- **CSP header**: a strict `Content-Security-Policy` for the `app://` protocol handler once all asset origins are known.
- **Code signing**: deferred; unsigned artifacts are acceptable for first MVP release.

---

## License

[AGPL-3.0](LICENSE). Modifications must be published under the same license.
