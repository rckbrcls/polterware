const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.json');
const native = require('./notify.node');
let replies = 0;
function finish(result) {
  fs.writeFileSync(config.result, JSON.stringify(result));
  app.quit();
}
// Install and close before readiness while Cocoa requests are in flight. No
// permission prompt, scheduling, removal, or interaction with production data.
try {
  native.start(() => { replies++; });
  let duplicateStartRejected = false;
  try { native.start(() => {}); } catch { duplicateStartRejected = true; }
  native.send('closing-status', 'status', 'null');
  native.send('closing-pending', 'pending', 'null');
  native.close(); native.close();
  if (!duplicateStartRejected) throw Error('duplicate-start-accepted');
  let closedSendRejected = false;
  try { native.send('closed', 'status', 'null'); } catch { closedSendRejected = true; }
  if (!closedSendRejected) throw Error('closed-send-accepted');
  // Repeated native lifecycle start/close exercises observer ownership and TSFN abort.
  for (let i = 0; i < 25; i++) {
    native.start(() => { replies++; });
    native.send(String(i), 'pending', 'null');
    native.close();
  }
  app.whenReady().then(() => {
    native.start(raw => {
      const message = JSON.parse(raw);
      if (message.rid === 'final-status') {
        if (message.error || !['authorized', 'provisional', 'denied', 'notDetermined', 'unknown'].includes(message.value?.authorization)) return finish({ passed: false, error: 'invalid-status' });
        // Leave one pending native callback to exercise the environment cleanup hook.
        native.send('cleanup-pending', 'pending', 'null');
        finish({ passed: true, cycles: 26, duplicateStartRejected, closedSendRejected, authorization: message.value.authorization, pendingCount: message.value.pendingCount, electron: process.versions.electron, abi: process.versions.modules, napi: process.versions.napi, replies });
      }
    });
    native.send('final-status', 'status', 'null');
  });
} catch { app.whenReady().then(() => finish({ passed: false, error: 'lifecycle-failed' })); }
setTimeout(() => finish({ passed: false, error: 'lifecycle-timeout' }), 10_000);
