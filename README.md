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
| Auto-update | electron-updater (metadata emitted; runtime not wired) |
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

## Cross-platform packaging status (MVP)

What the current `dist:linux` and `dist:win` chains actually produce when run from a macOS host. As above, do not blur "config exists" with "this repo successfully built it here":

| Target | macOS host produces | Real Linux / Windows host produces | Trusted on a fresh user machine |
|-|-|-|-|
| Linux **AppImage** (`Hush-*.AppImage`) | **Yes** — verified: `ELF 64-bit LSB executable, ARM aarch64`. Run-tested on a Linux machine: not done from this repo. | Yes (same path). | AppImage is not signed; runs as a self-contained executable. Most distros require `chmod +x` and trust comes from out-of-band download channel. |
| Linux **deb** (`hush-desktop_*.deb`) | **No, intentionally skipped on non-Linux hosts**. The `fpm` shipped with electron-builder for macOS produces a malformed BSD-`ar` archive (~96 bytes) that no Debian/Ubuntu system can install. The config therefore omits `deb` from `linux.target` when `process.platform !== 'linux'` and only emits AppImage on macOS hosts. | Yes — `dpkg-deb` is the right tool and `fpm` works correctly on Linux. | Unsigned `.deb`. Distros prompt for trust on first install. |
| Windows **nsis** (`Hush Setup *.exe`) | **Yes** — verified: `PE32 executable (GUI) Intel 80386, for MS Windows, Nullsoft Installer self-extracting archive` (the launcher) and `PE32+ executable (GUI) Aarch64, for MS Windows` (the inner `Hush.exe`). electron-builder downloads its own Wine, winCodeSign, and NSIS toolchain into the dependency cache; no system Wine is required on macOS hosts. Run-tested on a Windows machine: not done from this repo. | Yes (same path). | The build is **unsigned** ("no signing info identified, signing is skipped"). Windows SmartScreen will warn on first run. Authenticode signing requires a code-signing certificate (EV or OV) and `signtool.exe` configuration that this repo does not yet wire. |

What this means in practice:

- **Linux AppImage and Windows nsis can both be built from a macOS host today.** This was directly exercised against the current repo state and the artefacts are real PE / ELF executables.
- **Linux deb requires a real Linux host (or Docker)** because the `fpm` macOS binary that electron-builder bundles does not produce a valid Debian package archive. The config opts out of deb on non-Linux hosts to avoid shipping the silent 96-byte malformed file.
- **Windows nsis is unsigned.** Microsoft SmartScreen will warn on first launch the same way macOS Gatekeeper does without a Developer ID cert. Signing requires an external certificate (typically EV from a CA like DigiCert / Sectigo) and is its own slice — see "Deferred".

---

## Update path status (MVP)

The repo already produces the metadata that an `electron-updater` flow expects, but the runtime side of that flow is intentionally NOT wired. As above, the four states are easy to confuse — keep them separate:

| Layer | What it means | Current state |
|-|-|-|
| **Updater dependency declared** | `electron-updater` is in `package.json`. | **Yes** (`electron-updater: ^6.3.0`). |
| **Update metadata files emitted by packaging** | `electron-builder` writes `app-update.yml` into the packaged app's `Resources/` and writes `latest-*.yml` (`latest-mac.yml`, `latest-linux-arm64.yml`, `latest.yml`) alongside the build artefacts in `dist/`. These are the files an updater client reads to decide whether a new release exists. | **Yes**. The shipped `app-update.yml` reads `provider: github / owner: hushhq / repo: hush-desktop` (auto-derived from the git remote — no `publish` config in `electron-builder.config.js`). |
| **App actually checks a live feed at runtime** | Main-process code calls `autoUpdater.checkForUpdates()` (or equivalent) and surfaces `update-available` / `update-downloaded` events. | **No**. There is no `autoUpdater` reference anywhere under `src/main/`. The packaged app never queries GitHub for updates and never prompts the user. |
| **App successfully downloads and applies updates** | A real release is published, the running app downloads it, `electron-updater` verifies the signature and stages it, and the next launch comes up on the new version. | **No**. Even if the runtime check were wired, `https://api.github.com/repos/hushhq/hush-desktop/releases` currently returns `[]` — the GitHub repo exists but has no published releases yet, so any feed query would resolve to "no update". And the macOS bundle is signed with an Apple Development cert, not a Developer ID, so `electron-updater`'s signature requirement could not currently be satisfied for a real downloaded `.zip` even if releases existed. |

Net effect: **the desktop wrapper today is a manually-distributed, manually-updated binary.** Users on the MVP build will not be auto-prompted to update. The intended GitHub-releases distribution layout exists in metadata, but several real prerequisites are missing before a runtime updater can be safely wired:

1. A first published release on `github.com/hushhq/hush-desktop` (the `latest-*.yml` + the corresponding `.zip` / `.dmg` / `.AppImage` / `.exe` uploaded as release assets).
2. A signing identity that `electron-updater` can verify — Developer ID Application (macOS) and an Authenticode certificate (Windows). The current Apple Development cert is not sufficient.
3. A privacy-conscious update UX. Hush is a privacy-focused product; a silent on-launch check that sends a request to `api.github.com` on every cold start is a tracking surface that must be opt-in or at least disclosed in the user settings before being enabled by default.
4. Notarized macOS artefacts (see "macOS distribution status") — the Sparkle/Squirrel chain that `electron-updater` drives on macOS expects notarized + stapled bundles.

A future updater slice should land the wiring (`autoUpdater.checkForUpdatesAndNotify()` or an explicit user-triggered check, with proper event handling and error logging), the privacy UX, and the corresponding notes in user-facing settings — none of which is honest to do in one slice without those prerequisites in place.

---

## Deferred (next slice)

- **Vault wrapping key via OS keychain**: `keytar` integration for macOS Keychain / Windows Credential Store / libsecret. The IPC channel shape is reserved in `src/shared/ipc-channels.ts`; the renderer must never hold key material directly.
- **Auto-update wiring**: see the "Update path status" table above. Metadata is emitted, runtime is not wired, no releases published, signing prerequisites unmet.
- **CSP header**: a strict `Content-Security-Policy` for the `app://` protocol handler once all asset origins are known.
- **macOS production code signing + notarization**: see the "macOS distribution status" table above.
- **Windows Authenticode signing**: an EV / OV code-signing certificate plus `signtool.exe` wiring in `win.certificateFile` / `win.certificatePassword` (or the equivalent CSC env vars). Without it, Windows SmartScreen will warn on first launch.
- **Linux deb on non-Linux hosts**: a Docker-based packaging step (or a Linux CI runner) so the `dpkg-deb` invocation in `fpm` happens on a real Linux kernel and produces a valid `.deb`.

---

## License

[AGPL-3.0](LICENSE). Modifications must be published under the same license.
