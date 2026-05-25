# Package Manager Distribution

HUSHHQ-35. Templates for the approved package-manager distribution
channels. **Nothing in this directory is auto-published.** Each
manifest is a starting point that an operator must check, sign, and
submit by hand to the upstream registry.

The landing site at `https://gethush.live` hides every command until
the corresponding channel actually ships (see
`hush-landing/app/page.tsx`, `PackageCommand.live`). Do not flip
`live: true` on the landing side until the upstream registry returns
a successful install for the published manifest.

## Approved matrix

| OS | Direct artifact (already published) | Package manager | Manifest |
|-|-|-|-|
| macOS | `Hush-<version>-arm64.dmg`, `Hush-<version>.dmg` | Homebrew Cask | `homebrew-cask/hush.rb` |
| Windows | `Hush.Setup.<version>.exe` (NSIS) | Winget | `winget/H/Hush/Desktop/<version>/*` |
| Linux | `Hush-<version>.AppImage`, `hush-desktop_<version>_amd64.deb` | AUR `hush-bin` | `aur/PKGBUILD` |

## Out of scope (first pass)

Do not add manifests for: Flatpak/Flathub, Snap, Chocolatey, Scoop, RPM,
Nix / nixpkgs, Windows ARM64. These channels are explicitly not part of
the approved matrix and any work on them needs a separate decision.

## Workflow when publishing

1. Confirm the desktop release artifacts for the target version are
   already on GitHub Releases under
   `https://github.com/hushhq/hush-desktop/releases/tag/v<version>`.
2. Compute the SHA-256 of each artifact you reference in a manifest:

   ```sh
   shasum -a 256 Hush-<version>-arm64.dmg
   sha256sum Hush.Setup.<version>.exe
   sha256sum Hush-<version>.AppImage
   ```

3. Fill the `TODO(sha256)` placeholders in the relevant manifest.
4. Submit through the upstream channel's normal review process
   (Homebrew tap PR, microsoft/winget-pkgs PR, AUR git push). No CI in this
   repo opens those PRs automatically.
5. Once the upstream registry confirms the install command works,
   flip the matching `PackageCommand.live` flag in
   `hush-landing/app/page.tsx` and redeploy the landing.

## Public / private boundary

These templates reference only public assets: GitHub Release URLs,
public bundle identifiers (`live.gethush.desktop`), the public
support contact, and the public LICENSE. Do not add private ops
hostnames, internal deploy paths, or internal automation hooks to
any file in this directory — anything here may end up mirrored into
the relevant upstream registry.
</content>
