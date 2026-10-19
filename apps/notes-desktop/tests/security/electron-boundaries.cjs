// Run after electron-vite build. PLAYWRIGHT_MODULE points to an isolated tooling install.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-w3-security-electron-'));
  const secret = path.join(data, 'sentinel.txt');
  fs.writeFileSync(secret, 'throwaway-security-sentinel', { mode: 0o600 });
  const harness = path.join(data, 'harness.cjs');
  // In Electron the built-in module takes precedence; keep the harness independent of npm resolution.
  fs.writeFileSync(harness, `const {app}=require('electron');\napp.setPath('userData',${JSON.stringify(path.join(data,'profile'))});\napp.setPath('appData',${JSON.stringify(data)});\napp.setPath('logs',${JSON.stringify(path.join(data,'logs'))});\napp.setAsDefaultProtocolClient=()=>true;\napp.getAppPath=()=>${JSON.stringify(root)};\nconst ready=app.isReady.bind(app);\napp.on('ready',()=>{});\nimport(${JSON.stringify(require('node:url').pathToFileURL(path.join(root,'out/main/index.js')).href)}).then(()=>{if(ready()) app.emit('ready',{},{});}).catch(e=>{console.error(e);app.quit();});\n`);
  const stub = path.join(data, 'notify.cjs');
  fs.writeFileSync(stub, `let callback;module.exports={start:fn=>callback=fn,wasActionLaunch:()=>false,close:()=>{},send:(rid,command)=>callback(JSON.stringify({rid,value:command==='status'?{authorization:'denied',pendingCount:0}:true}))};`);
  const electron = require('electron');
  const app = await _electron.launch({ executablePath: electron, args: [harness, `--user-data-dir=${path.join(data,'profile')}`], env: {
    ...process.env, PWNOTES_NOTIFY_MODULE: stub, PWNOTES_CORE_DB: path.join(data,'notes.db'), PWNOTES_CORE_BIN: process.env.PWNOTES_CORE_BIN,
    PWNOTES_CORE_ENDPOINT: '', PWNOTES_CORE_TOKEN: '', ELECTRON_RENDERER_URL: '',
  }});
  try {
    app.process().stderr.on("data", chunk => process.stderr.write(chunk));
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.pwnotes));
    const results = await page.evaluate(async secretUrl => {
      const read = async url => { try { const r = await fetch(url); return r.ok ? await r.text() : `blocked:${r.status}`; } catch { return 'blocked'; } };
      return { node: [typeof window.require, typeof window.process, typeof window.ipcRenderer], file: await read(secretUrl), popup: window.open('file:///etc/passwd') === null };
    }, require('node:url').pathToFileURL(secret).href);
    const policy = await page.evaluate(async () => {
      let policy = "";
      document.addEventListener("securitypolicyviolation", event => { policy = event.originalPolicy; }, { once: true });
      try { await fetch("http://127.0.0.1:9/security-probe"); } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
      return policy;
    });
    assert.match(policy, /script-src 'self'/);
    assert.doesNotMatch(policy, /\*|127\.0\.0\.1|localhost|nominatim/);
    const off = await page.evaluate(async () => {
      await window.pwnotes.settings.set({ keys: ['agents.mcpEnabled'], settings: { agentsMcpEnabled: false } });
      return window.pwnotes.app.testMcpConnection();
    });
    assert.equal(off.ok, false);
    const probe = await page.evaluate(async () => {
      await window.pwnotes.settings.set({ keys: ['agents.mcpEnabled'], settings: { agentsMcpEnabled: true } });
      return window.pwnotes.app.testMcpConnection();
    });
    assert.equal(probe.ok, true);
    assert.equal(probe.toolCount, 18);
    assert.equal('token' in probe, false);
    const preferences = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.deepEqual(results.node, ['undefined','undefined','undefined']);
    console.log(JSON.stringify({ data, ...results, csp: policy, mcpProbe: probe.ok }));
    assert.notEqual(results.file, 'throwaway-security-sentinel', 'renderer read an arbitrary local file');
    assert.equal(results.popup, true);
  } finally {
    await app.close();
    const state = path.join(data, 'run/core.json');
    if (fs.existsSync(state)) { const {pid,dbPath}=JSON.parse(fs.readFileSync(state)); if(dbPath===path.join(data,'notes.db')) { try { process.kill(pid,'SIGTERM'); } catch {} } }
  }
})().catch(error => { console.error(error.message); process.exitCode=1; });
