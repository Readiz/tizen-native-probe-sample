/* Check cancellation ordering without claiming Tizen framework behavior. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const context = { setTimeout, clearTimeout, console };
context.window = context;
vm.createContext(context);
for (const name of ['settings.js', 'bridge.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../web/js', name), 'utf8'), context);
let ready = false, listener;
const launches = [], results = [];
context.tizen = { application: {
  getCurrentApplication() { return { appInfo: { id: 'CppProbe01.WebUI', packageId: 'CppProbe01' } }; },
  launch(id, ok, error) { launches.push({ ok, error }); }
}, messageport: {
  requestLocalMessagePort() { return { addMessagePortListener(fn) { listener = fn; return 1; }, removeMessagePortListener() {} }; },
  requestRemoteMessagePort(appId, port) {
    if (!ready) { const e = new Error('waiting'); e.name = 'NotFoundError'; throw e; }
    return { sendMessage(items) {
      const request = Object.fromEntries(items.map(x => [x.key, x.value]));
      const reply = { protocol: '1', id: request.id, op: request.op, status: 'ok', runtime: 'tizen-native', message: 'pong' };
      setTimeout(() => listener(Object.keys(reply).map(key => ({ key, value: reply[key] })), { appId, messagePortName: port }), 1);
    } };
  }
} };
const bridge = new context.ProbeBridge(context.PROBE_SETTINGS);
bridge.connect(e => results.push(['first', e ? e.code : 'ok']));
bridge.close();
bridge.connect(e => results.push(['second', e ? e.code : 'ok']));
launches[0].error({ name: 'OLD_LAUNCH_ERROR', message: 'late callback' });
ready = true;
launches[1].ok();
setTimeout(() => {
  try {
    assert.deepEqual(results, [['first', 'CANCELLED'], ['second', 'ok']]);
    console.log('Bridge cancellation: old launch callback cannot fail a newer connection. Fake API only.');
  } finally { bridge.close(); }
}, 220);
