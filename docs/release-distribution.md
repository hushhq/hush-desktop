# Desktop Release Distribution

GitHub Releases are the single source of truth for Hush desktop binaries.

The same release assets feed:

- direct downloads from the website;
- `electron-updater` desktop update checks;
- package-manager manifests such as Homebrew Cask, WinGet, AUR, and Flathub.

Do not publish binaries to a separate bucket unless that bucket also becomes the updater feed. Split feeds create downgrade and compatibility risks.

## Release flow

1. Merge `hush-desktop` and `hush-web` release candidates to their release branches.
2. Create a semver tag in `hush-desktop`, for example:

   ```sh
   git tag v0.8.0-alpha.1
   git push origin v0.8.0-alpha.1
   ```

3. The `Release Desktop` workflow builds macOS, Windows, and Linux artifacts.
4. The workflow uploads all installer files, update metadata files, and blockmaps to the GitHub Release.

Required release assets:

| Platform | User-facing artifact | Updater metadata |
|-|-|-|
| macOS | `.dmg` for direct download, `.zip` for updater | `latest-mac.yml`, `.blockmap` |
| Windows | `.exe` NSIS installer, portable `.exe` | `latest.yml`, `.blockmap` |
| Linux | `.AppImage`, `.deb`, `.tar.gz` | `latest-linux.yml` or arch-specific metadata, `.blockmap` where emitted |

The release also publishes `sha256sums.txt`. That file is for humans and package maintainers; updater clients use the `latest*.yml` metadata.

## Update payloads

`electron-builder` emits `.blockmap` files alongside supported artifacts. `electron-updater` can use those blockmaps for differential downloads where the target platform and artifact type support it.

Do not promise that every platform will always download only a delta. The UI must display the real `download-progress` event from `electron-updater`; that event is the authoritative source for transferred bytes, percent, and speed.

## Signing state

macOS release builds are signed and notarized in CI. The `Release Desktop`
workflow requires these repository secrets for the macOS matrix job:

| Secret | Purpose |
|-|-|
| `MAC_CSC_LINK` | Base64-encoded Developer ID Application certificate |
| `MAC_CSC_KEY_PASSWORD` | Certificate password |
| `MAC_CSC_NAME` | Optional exact signing identity name; defaults to `Developer ID Application` |
| `APPLE_API_KEY` | App Store Connect API key `.p8` contents |
| `APPLE_API_KEY_ID` | App Store Connect API key id |
| `APPLE_API_ISSUER` | App Store Connect issuer id |
| `APPLE_TEAM_ID` | Apple team id |
| `WIN_CSC_LINK` | Base64-encoded Windows Authenticode certificate |
| `WIN_CSC_KEY_PASSWORD` | Certificate password |

`MAC_CSC_LINK` is passed to electron-builder as `CSC_LINK`, and
`MAC_CSC_KEY_PASSWORD` is passed as `CSC_KEY_PASSWORD`. The macOS job pins
`CSC_NAME` to `MAC_CSC_NAME` when configured, otherwise `Developer ID
Application`, so an Apple Development, Mac Development, Apple Distribution, or
Developer ID Installer certificate fails before notarization.

`APPLE_API_KEY` stores the `.p8` file contents in GitHub secrets. The workflow
writes it to a private temporary file because `notarytool` requires a filesystem
path. Release CI keeps electron-builder's inline notarization disabled and runs
`scripts/notarize-mac-app.cjs` from the `afterSign` hook instead. That hook
zips the signed `.app`, submits that app bundle to Apple, logs the submission
id, polls status once per minute, staples the accepted ticket to the `.app`,
and only then lets electron-builder create the DMG and updater ZIP from the
notarized app. CI caps each app notarization wait with
`HUSH_NOTARY_TIMEOUT_MINUTES`; if Apple leaves a submission in progress past
that threshold, the release fails fast with the submission id instead of
blocking for hours. Local package builds keep notarization disabled unless
`HUSH_DESKTOP_NOTARIZE_APP=1` is explicitly set.

The macOS job must verify the final downloadable DMG and ZIP artifacts with
`codesign`, `spctl`, and `stapler` before upload. A release is not valid just
because notarization was attempted; the final artifact users download must pass
Gatekeeper validation.

Unsigned artifacts are acceptable for internal development, but they are not
acceptable as a polished public distribution path:

- macOS users will see Gatekeeper warnings without Developer ID plus notarization;
- Windows users will see SmartScreen warnings without Authenticode signing;
- package managers may reject or flag unsigned submissions.

## Desktop updater policy

During early launch, the desktop app should enforce update checks at startup without breaking offline access:

- packaged builds check for updates during startup;
- the startup check has a hard 3 second timeout;
- timeout, GitHub outage, DNS failure, or offline network state must skip the update and continue opening the local app;
- if an update is available, the app may block interactive use while downloading and installing it;
- the updater UI must show current version, target version, and real `download-progress` values;
- failed downloads must continue into the old local app, not leave a black screen.

This policy protects local IndexedDB history access. A stale client is better than an inaccessible client when the user is offline.

## Website downloads

The website should not hardcode installer URLs. Download buttons should resolve the latest release from:

```text
https://api.github.com/repos/hushhq/hush-desktop/releases/latest
```

Use the asset names to select the right installer for the user's platform. Display the release tag and link to `sha256sums.txt`.

## Package-manager plan

All package-manager recipes should point at the GitHub Release assets.

| Manager | Source |
|-|-|
| Homebrew Cask | Tap cask with URL and SHA256 from the macOS GitHub Release artifact |
| WinGet | Manifest PR referencing the signed Windows installer from GitHub Releases |
| AUR | `hush-bin` PKGBUILD sourcing the Linux `.tar.gz` or `.AppImage` and checksum |
| Flathub | Manifest maintained in Flathub infrastructure, sourcing GitHub Release artifacts |

Do not make Snap the primary Linux path. It can be revisited later if there is demand, but the default Linux distribution plan is AppImage, deb, tar.gz, AUR, and Flathub.

Do not submit package-manager manifests until the first real GitHub Release exists. The manifests need stable asset names and hashes from that release.
