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

## macOS distribution status (MVP)

The current `dist:mac` output is intended for local + internal MVP use, not for public distribution. Four states that are easy to confuse — keep them separate:

| State | What it means | Current state |
|-|-|-|
| **Locally signed** | The bundle has a code signature. electron-builder auto-picks the first available macOS signing identity in the local keychain. | **Yes**, with an **Apple Development** cert (`Authority: Apple Development: …`). Hardened runtime is enabled (`flags=0x10000(runtime)`). |
| **Gatekeeper-assessed on this workstation** | `spctl --assess` returns "accepted" on the developer's own machine. | **Yes**, but this is workstation-local. The result can also include `override=security disabled` if the developer has globally relaxed Gatekeeper. It tells you nothing about other machines. |
| **Notarized by Apple** | Submitted to Apple's notary service and stapled (`xcrun stapler staple`). Required for distribution outside the development team. | **No**. `dist:mac` skips notarization (`reason="notarize" options were unable to be generated`). |
| **Safe first-run on a fresh Mac** | A user downloading the build from the internet can double-click and launch without Gatekeeper warnings. | **No**. Apple Development certs are not trusted for public distribution, and there is no notarization. A fresh user account will see "Apple cannot check it for malicious software" and need to right-click → Open (or `xattr -d com.apple.quarantine`) to override Gatekeeper. |

To make the build distribution-ready outside the dev team, the following are required and **cannot be done from inside this repo**:

1. A **Developer ID Application** certificate (paid Apple Developer Program; *different* from the Apple Development cert produced by Xcode / Apple Configurator).
2. `notarytool` credentials: an Apple ID + app-specific password, or an App Store Connect API key.
3. A run of `electron-builder` with `mac.identity` set to the Developer ID identity *and* `mac.notarize` configured (or the equivalent `notarize` post-build step).
4. `xcrun stapler staple` on the resulting `.dmg` / `.zip`.

The local build chain (`npm run dist:mac`) is fine for MVP-internal use and developer machines that have already trusted the Apple Development cert. Do not hand it to external users without going through the steps above.

---

## Deferred (next slice)

- **Vault wrapping key via OS keychain**: `keytar` integration for macOS Keychain / Windows Credential Store / libsecret. The IPC channel shape is reserved in `src/shared/ipc-channels.ts`; the renderer must never hold key material directly.
- **Auto-update wiring**: `electron-updater` is installed; the update check and event handlers are not yet registered.
- **CSP header**: a strict `Content-Security-Policy` for the `app://` protocol handler once all asset origins are known.
- **Production code signing + notarization**: see the "macOS distribution status" table above.

---

## License

[AGPL-3.0](LICENSE). Modifications must be published under the same license.
