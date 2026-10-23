const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { statSync, utimesSync } = require('node:fs');
const { releaseAppById } = require('./apps.cjs');

// electron-builder afterPack hook shared by the desktop apps. It runs after the
// resources and Info.plist are assembled and before the DMG/ZIP are created.
// Signing is ad-hoc: no certificates, entitlements or hardened runtime.
module.exports = async ({ appOutDir, electronPlatformName, packager }) => {
  if (electronPlatformName !== 'darwin') throw new Error('Desktop releases are macOS only');
  const release = releaseAppById(packager.appInfo.id);
  const app = join(appOutDir, `${release.product}.app`);
  const resources = join(app, 'Contents', 'Resources');
  const appKey = Object.keys(require('./apps.cjs').apps).find(key => require('./apps.cjs').apps[key].appId === release.appId);
  require('../updater/package.cjs')(app, appKey);
  const binaries = release.binaries.map((binary) => join(resources, binary.path));
  const times = binaries.map((binary) => statSync(binary));
  for (const binary of binaries) {
    execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', binary], { stdio: 'inherit' });
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
  // Deep signing rewrites nested binaries. Restore their mtime so a core build
  // handshake keyed on mtime follows SOURCE_DATE_EPOCH rather than wall time.
  binaries.forEach((binary, index) => utimesSync(binary, times[index].atime, times[index].mtime));
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
