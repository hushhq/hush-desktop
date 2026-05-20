import type { GlassMaterial } from '../shared/desktop-api';

/**
 * Curated macOS vibrancy materials Hush is willing to apply. Mirrors
 * the whitelist in `glass-material.ts` so the capability payload and
 * the runtime apply step cannot drift.
 */
export const MACOS_GLASS_MATERIALS: readonly GlassMaterial[] = [
  'sidebar',
  'under-window',
  'menu',
  'headerView',
];

/**
 * `BrowserWindow.setBackgroundMaterial()` lights up on Windows 11 22H2
 * and later. The Windows 11 22H2 release maps to NT build number 22621,
 * which is what `os.release()` reports on those hosts (e.g.
 * `"10.0.22621.1234"`). Older Windows 11 builds (22000) silently ignore
 * the call, so runtime material switching must stay disabled there too.
 */
export const WIN11_22H2_BUILD = 22621;

export const WIN32_GLASS_MATERIALS: readonly GlassMaterial[] = ['mica', 'acrylic'];

/**
 * Snapshot the renderer needs before applying a native material.
 * Computed in main from the host platform and OS release so the
 * renderer never has to second-guess Electron capabilities. `materials`
 * always includes the `auto` sentinel first when material switching is
 * supported.
 */
export interface GlassCapabilities {
  readonly platform: NodeJS.Platform;
  readonly materialSwitchingSupported: boolean;
  readonly materials: readonly GlassMaterial[];
  /**
   * Machine-readable reason for an unsupported result. Surfaced for
   * diagnostics + tests; the renderer uses `materialSwitchingSupported`
   * for branching.
   */
  readonly unsupportedReason: GlassUnsupportedReason | null;
}

export type GlassUnsupportedReason =
  | 'linux-no-native-material'
  | 'win32-pre-22h2'
  | 'win32-unparseable-release';

/**
 * Parses a Windows-style `os.release()` string into the NT build number.
 * Returns `null` for inputs the function cannot validate (empty string,
 * non-numeric, fewer than three dot-separated parts).
 */
export function parseWindowsBuildNumber(release: string): number | null {
  if (typeof release !== 'string') return null;
  const parts = release.split('.');
  if (parts.length < 3) return null;
  const build = Number(parts[2]);
  if (!Number.isFinite(build) || build <= 0) return null;
  return Math.trunc(build);
}

/**
 * Pure capability calculator. Lifted out of the IPC handler so the
 * Win11-22H2-and-up rule can be unit-tested without spinning up Electron.
 */
export function computeGlassCapabilities(
  platform: NodeJS.Platform,
  osRelease: string,
): GlassCapabilities {
  if (platform === 'darwin') {
    return {
      platform,
      materialSwitchingSupported: true,
      materials: ['auto', ...MACOS_GLASS_MATERIALS],
      unsupportedReason: null,
    };
  }
  if (platform === 'win32') {
    const build = parseWindowsBuildNumber(osRelease);
    if (build === null) {
      return {
        platform,
        materialSwitchingSupported: false,
        materials: [],
        unsupportedReason: 'win32-unparseable-release',
      };
    }
    if (build < WIN11_22H2_BUILD) {
      return {
        platform,
        materialSwitchingSupported: false,
        materials: [],
        unsupportedReason: 'win32-pre-22h2',
      };
    }
    return {
      platform,
      materialSwitchingSupported: true,
      materials: ['auto', ...WIN32_GLASS_MATERIALS],
      unsupportedReason: null,
    };
  }
  return {
    platform,
    materialSwitchingSupported: false,
    materials: [],
    unsupportedReason: 'linux-no-native-material',
  };
}
