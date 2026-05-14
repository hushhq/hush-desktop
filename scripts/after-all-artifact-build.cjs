/**
 * electron-builder afterAllArtifactBuild hook.
 *
 * electron-builder may recreate the output directory during packaging, so the
 * Spotlight marker is written again after artifacts are complete.
 */
const { markDistPrivate } = require('./mark-dist-private.cjs');

exports.default = async function afterAllArtifactBuild(context) {
  markDistPrivate(context.packager.projectDir);
  return [];
};
