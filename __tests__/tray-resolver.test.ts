import { describe, expect, it } from 'vitest';
import { join } from 'path';
import {
  buildTrayIconCandidates,
  resolveTrayIconPathFrom,
  type TrayIconCandidateContext,
} from '../src/main/tray';

const PACKAGED_CONTEXT: TrayIconCandidateContext = {
  isPackaged: true,
  appPath: '/Applications/Hush.app/Contents/Resources/app.asar',
  resourcesPath: '/Applications/Hush.app/Contents/Resources',
  platform: 'darwin',
};

const DEV_CONTEXT: TrayIconCandidateContext = {
  isPackaged: false,
  appPath: '/Users/dev/hush-desktop',
  resourcesPath: '/opt/Electron.app/Contents/Resources',
  platform: 'darwin',
};

const PACKAGED_LINUX_CONTEXT: TrayIconCandidateContext = {
  isPackaged: true,
  appPath: '/opt/Hush/resources/app.asar',
  resourcesPath: '/opt/Hush/resources',
  platform: 'linux',
};

describe('buildTrayIconCandidates', () => {
  it('PackagedMac_ResolvesTemplateIconFromProcessResourcesPath_NotFromAppPath', () => {
    const candidates = buildTrayIconCandidates(PACKAGED_CONTEXT);
    expect(candidates).toEqual([
      join('/Applications/Hush.app/Contents/Resources', 'build', 'trayIconTemplate.png'),
    ]);
    // Sanity-check the regression: the old path under `app.getAppPath()` must
    // not appear, otherwise the packaged tray will silently fall back to a
    // location that does not exist inside the asar.
    expect(candidates).not.toContain(
      join(PACKAGED_CONTEXT.appPath, 'build', 'trayIconTemplate.png'),
    );
  });

  it('DevMac_PrefersBuildTemplateThenAssetTemplate', () => {
    const candidates = buildTrayIconCandidates(DEV_CONTEXT);
    expect(candidates).toEqual([
      join('/Users/dev/hush-desktop', 'build', 'trayIconTemplate.png'),
      join('/Users/dev/hush-desktop', 'assets', 'hush.icon', 'Assets', 'trayIconTemplate.png'),
    ]);
  });

  it('PackagedNonMac_KeepsBrandIconFallback', () => {
    const candidates = buildTrayIconCandidates(PACKAGED_LINUX_CONTEXT);
    expect(candidates).toEqual([
      join('/opt/Hush/resources', 'build', 'icon.png'),
    ]);
  });
});

describe('resolveTrayIconPathFrom', () => {
  it('PackagedMac_ReturnsResourcesTemplateWhenPresent', () => {
    const expected = join(
      PACKAGED_CONTEXT.resourcesPath,
      'build',
      'trayIconTemplate.png',
    );
    const result = resolveTrayIconPathFrom(PACKAGED_CONTEXT, (p) => p === expected);
    expect(result).toBe(expected);
  });

  it('Packaged_ReturnsNullWhenIconMissing', () => {
    const result = resolveTrayIconPathFrom(PACKAGED_CONTEXT, () => false);
    expect(result).toBeNull();
  });

  it('Dev_PicksFirstExistingCandidateInOrder', () => {
    const fallback = join(
      DEV_CONTEXT.appPath,
      'assets',
      'hush.icon',
      'Assets',
      'trayIconTemplate.png',
    );
    const result = resolveTrayIconPathFrom(DEV_CONTEXT, (p) => p === fallback);
    expect(result).toBe(fallback);
  });

  it('DevMac_PrefersBuildTemplateOverAssetTemplate', () => {
    const primary = join(DEV_CONTEXT.appPath, 'build', 'trayIconTemplate.png');
    const result = resolveTrayIconPathFrom(DEV_CONTEXT, () => true);
    expect(result).toBe(primary);
  });

  it('ReturnsNullWhenNoCandidateExists', () => {
    const result = resolveTrayIconPathFrom(DEV_CONTEXT, () => false);
    expect(result).toBeNull();
  });
});
