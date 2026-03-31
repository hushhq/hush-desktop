![Status](https://img.shields.io/badge/status-planned-yellow)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

# hush-desktop

Electron desktop application for [Hush](https://gethush.live), an end-to-end encrypted communication platform.

**Status: Planned**

---

## What this will be

hush-desktop wraps `hush-web` in an Electron shell, adding native desktop integrations that are not available in a browser:

- Native window titlebar and tray icon
- System tray with notification badges
- Auto-update via `electron-updater`
- Keychain/keystore integration via `keytar` for vault PIN storage
- Push-to-talk global hotkey
- Native notifications

The cryptographic core (`@gethush/hush-crypto`) and all E2EE functionality are inherited from `hush-web`. No crypto changes are needed for the desktop app.

---

## Technology choices

| Component | Choice |
|-|-|
| Shell | [Electron](https://www.electronjs.org/) (latest stable) |
| Renderer | `hush-web` (loaded as a local Vite build) |
| Keystore | [`keytar`](https://github.com/atom/node-keytar) (OS keychain integration) |
| Auto-update | [`electron-updater`](https://www.electron.build/auto-update) |
| Packaging | [`electron-builder`](https://www.electron.build/) |

Supported platforms: Linux (.deb, .AppImage), macOS (.dmg), Windows (.exe, NSIS).

---

## Roadmap

hush-desktop is planned after the core web and server experience is stable. Track progress at [gethush.live](https://gethush.live).

---

## Contributing

This repository is a placeholder. Contributions will be accepted once development begins. Watch this repository for updates.

---

## License

[AGPL-3.0](LICENSE). Modifications to this desktop application must be published under the same license.
