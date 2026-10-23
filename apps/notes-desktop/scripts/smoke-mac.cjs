// Run only against a release ZIP. Profiles, DBs and extraction stay in a private
// temporary directory; no /Applications install or default Polterware Notes data access.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { tmpdir } = require('node:os');
const { join, dirname, resolve } = require('node:path');
const { createRequire } = require('node:module');
const desktopRequire = createRequire(join(__dirname, '../package.json'));
const { _electron, expect } = desktopRequire('@playwright/test');
const run = promisify(execFile);
const delay = ms => new Promise(done => setTimeout(done, ms));

(async () => {
  const zip = resolve(process.argv[2]);
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'notes-w3-packaging-')));
  const report = { directory, zip, startupMs: [], smoke: {}, native: {} };
  const extraction = join(directory, 'extracted');
  execFileSync('ditto', ['-x', '-k', zip, extraction]);
  const executablePath = join(extraction, 'Polterware Notes.app/Contents/MacOS/Polterware Notes');
  const binary = join(extraction, 'Polterware Notes.app/Contents/Resources/pwnotes');
  report.executable = executablePath;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PWNOTES_') && key !== 'ELECTRON_RUN_AS_NODE'));
  const profiles = [];
  let app;
  const output = resolve(process.argv[3] || join(dirname(zip), 'smoke-report.json'));
  async function launch(profile, link) {
    const started = performance.now();
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile.userdata}`, `--notes-e2e-env=${profile.environment}`, ...(link ? [link] : [])], env, timeout: 30000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Connecting…', { exact: true })).toHaveCount(0);
    return { page, elapsed: performance.now() - started };
  }
  async function state(profile) { return JSON.parse(await fs.readFile(join(dirname(profile.database), 'run/core.json'), 'utf8')); }
  async function stopCore(profile) {
    let core;
    try { core = await state(profile); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    assert.equal(core.dbPath, profile.database);
    try { process.kill(core.pid, 0); } catch { return; }
    const command = execFileSync('ps', ['-p', String(core.pid), '-o', 'args='], { encoding: 'utf8' });
    assert.ok(command.includes(binary) && command.includes(profile.database) && command.includes('serve'));
    process.kill(core.pid, 'SIGTERM');
    for (let i = 0; i < 50; i++) { try { process.kill(core.pid, 0); } catch { return; } await delay(100); }
    throw Error('Temporary core did not stop');
  }
  try {
    execFileSync(process.execPath, [join(__dirname, 'verify-bundle.cjs'), join(extraction, 'Polterware Notes.app')], { stdio: 'inherit' });
    for (let i = 0; i < 5; i++) {
      const root = join(directory, `sample-${i}`);
      await fs.mkdir(join(root, 'db'), { recursive: true });
      const profile = { database: join(root, 'db/notes.db'), userdata: join(root, 'userdata'), environment: join(root, 'environment.json') };
      profiles.push(profile);
      await fs.writeFile(profile.environment, JSON.stringify({ PWNOTES_CORE_DB: profile.database }), { mode: 0o600 });
      const { page, elapsed } = await launch(profile);
      await expect(page.getByRole('dialog', { name: 'Welcome to Polterware Notes' })).toBeVisible();
      report.startupMs.push(elapsed);
      await page.getByRole('button', { name: 'Skip onboarding', exact: true }).click();
      const core = await state(profile);
      const command = execFileSync('ps', ['-p', String(core.pid), '-o', 'args='], { encoding: 'utf8' });
      assert.ok(command.includes(binary));
      assert.equal(core.dbPath, profile.database);
      if (i === 0) {
        report.smoke.visibleContent = true;
        report.smoke.bundledCore = true;
        report.smoke.updates = (await page.evaluate(() => window.pwnotes.app.getInfo())).updates;
        assert.equal(report.smoke.updates, 'disabled');
        report.smoke.doctor = JSON.parse(execFileSync(binary, ['-db', profile.database, 'doctor', '--json'], { encoding: 'utf8' }));
        assert.equal(report.smoke.doctor.ok, true);
        const noteId = await page.evaluate(async () => (await window.pwnotes.notes.create({ title: 'Packaging persistence smoke' })).note.id);
        // Exercise the packaged second-instance pwnotes:// handler with the same
        // isolated profile; never ask LaunchServices to open a default profile.
        await run(executablePath, [`--user-data-dir=${profile.userdata}`, `--notes-e2e-env=${profile.environment}`, 'pwnotes://search?q=packaging'], { env, timeout: 15000 });
        await expect(page.getByRole('main')).toHaveAttribute('aria-label', 'Search');
        report.smoke.searchQuery = await page.getByRole('searchbox', { name: 'Search notes' }).inputValue();
        report.smoke.searchQueryResult = report.smoke.searchQuery === 'packaging' ? 'PASS' : 'FAIL: route opens but query is not applied';
        await run(executablePath, [`--user-data-dir=${profile.userdata}`, `--notes-e2e-env=${profile.environment}`, `pwnotes://note/${noteId}`], { env, timeout: 15000 });
        await expect(page.locator('[data-note-title]')).toHaveValue('Packaging persistence smoke');
        report.smoke.deepLink = 'PASS: packaged second-instance search route and note detail';
        report.native.before = await page.evaluate(() => window.pwnotes.reminders.status({}));
        report.native.authorization = await page.evaluate(async () => {
          try { return { ok: true, authorized: await window.pwnotes.app.requestNotificationAuthorization() }; }
          catch (error) { return { ok: false, error: String(error) }; }
        });
        await delay(2000);
        report.native.after = await page.evaluate(() => window.pwnotes.reminders.status({}));
        // Do not arm notifications in this smoke: cold notification actions omit
        // test flags and could open the real data directory. Live delivery has a
        // separate isolated-profile harness and only runs if authorization works.
        report.native.delivery = 'Not armed by smoke; see the separate real-native E2E run';
        await app.close(); app = undefined;
        process.kill(core.pid, 0);
        report.smoke.coreSurvivesQuit = true;
        const relaunched = await launch(profile);
        assert.equal(await relaunched.page.evaluate(async id => (await window.pwnotes.notes.get({ id })).note.title, noteId), 'Packaging persistence smoke');
        report.smoke.relaunchKeepsData = true;
      }
      await app.close(); app = undefined;
      await stopCore(profile);
    }
    report.startupMedianMs = [...report.startupMs].sort((a,b) => a-b)[2];
    report.smoke.coreCanStop = true;
    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.error = String(error); process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
    for (const profile of profiles) {
      try {
        const log = await fs.readFile(join(dirname(profile.database), 'run/notify.log'), 'utf8');
        (report.native.logs ||= []).push({ profile: dirname(profile.database), log });
      } catch {}
      await stopCore(profile);
    }
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    // Keep extracted ZIP and synthetic profiles as local reproduction evidence.
    // All validated detached core processes have been stopped.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
