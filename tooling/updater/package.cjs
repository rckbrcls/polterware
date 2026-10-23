const { execFileSync } = require('node:child_process');
const { copyFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const config = require('./config.cjs');

// Called before ad-hoc signing, so Sparkle, the addon, and Info.plist are covered by it.
module.exports = function packageUpdater(app, appKey) {
  const directory = __dirname;
  const contents = join(app, 'Contents');
  const plist = join(contents, 'Info.plist');
  mkdirSync(join(contents, 'Resources/updater'), { recursive: true });
  copyFileSync(join(directory, 'build/updater.node'), join(contents, 'Resources/updater/updater.node'));
  copyFileSync(join(directory, 'vendor/LICENSE'), join(contents, 'Resources/updater/Sparkle-LICENSE'));
  execFileSync('ditto', [join(directory, 'vendor/Sparkle.framework'), join(contents, 'Frameworks/Sparkle.framework')]);
  const build = process.env.SOURCE_DATE_EPOCH;
  if (!/^\d+$/.test(build ?? '')) throw Error('SOURCE_DATE_EPOCH is required for the Sparkle build number');
  function set(key, type, value) {
    // PlistBuddy's argument is passed directly, without a shell.
    try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], { stdio: 'pipe' }); }
    catch { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, plist]); }
  }
  set('CFBundleVersion', 'string', build);
  set('SUFeedURL', 'string', config.feedUrl(appKey));
  set('SUPublicEDKey', 'string', config.publicKey);
  set('SUEnableAutomaticChecks', 'bool', 'true');
  set('SUScheduledCheckInterval', 'integer', '86400');
  set('SUAutomaticallyUpdate', 'bool', 'false');
  set('SUShowReleaseNotes', 'bool', 'false');
  // The Sparkle framework contains its own installer and progress agent. Sign inside-out.
  const framework = join(contents, 'Frameworks/Sparkle.framework');
  for (const path of ['Versions/B/XPCServices/Downloader.xpc', 'Versions/B/XPCServices/Installer.xpc', 'Versions/B/Autoupdate', 'Versions/B/Updater.app', '']) {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', resolve(framework, path)], { stdio: 'inherit' });
  }
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', join(contents, 'Resources/updater/updater.node')], { stdio: 'inherit' });
};
