# Changelog

All notable changes to the Hush desktop app are recorded here. Format is based on
[Keep a Changelog](https://keepachangelog.com). Dates are ISO 8601. Versions track
the `hush-desktop` package version. The desktop app bundles the hush-web renderer,
so user-facing client changes also appear in the hush-web CHANGELOG.

Each released version below must have a matching `## [version]` section: the
release workflow extracts it as the GitHub Release body and fails the release if
it is missing.

## [Unreleased]

## [0.1.44-mvp] - 2026-06-01

### Fixed
- Screen sharing on macOS: selecting a window or screen now actually starts the
  share instead of silently doing nothing. (HUSHHQ-108)

### Internal
- Release pipeline now auto-updates the AUR package and Homebrew cask on tag.
  (HUSHHQ-111)

## [0.1.43-mvp] - 2026-06-01

### Fixed
- Voice and video: clients subscribe to the voice channel topic so MLS
  encryption-key commits are delivered and converge, and member removal uses the
  correct device-scoped identity encoding. (HUSHHQ-104, HUSHHQ-105)

## [0.1.42-mvp] - 2026-05-31

### Fixed
- Voice: call the correct MLS group-info export function. (HUSHHQ-97)

## [0.1.41-mvp] - 2026-05-31

### Fixed
- Voice: converge the MLS group on rejoin after the room emptied, and merge the
  pending commit after add/remove member. (HUSHHQ-97, HUSHHQ-99)

## [0.1.40-mvp] - 2026-05-30

### Added
- Windows manual-update path: the app no longer falsely claims to restart into a
  new version when it cannot auto-update. (HUSHHQ-92)

### Changed
- Desktop window chrome and update-flow UX refinements. (HUSHHQ-92)

---

Versions at or before `0.1.39-mvp` are recorded in the GitHub Releases and git
tags only.
