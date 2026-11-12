/* Protocol/transport logic tested with a fake API in Node. No TV API is executed. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
function environment(options = {}) {
  const w = { setTimeout, clearTimeout, console };
  w.window = w;
  vm.createContext(w);
  for (const name of ['settings.js', 'bridge.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../web/js', name), 'utf8'), w);
  w.PROBE_SETTINGS.requestTimeoutMs = 160;
  w.PROBE_SETTINGS.launchTimeoutMs = 200;
  const state = { ready: options.ready !== false, listener: null, calls: 0 };
  if (options.noTizen) return { w, state, bridge: new w.ProbeBridge(w.PROBE_SETTINGS) };
  w.tizen = {
    application: {
      getCurrentApplication() { return { appInfo: { id: options.wrongId ? 'Wrong.Web' : 'CppProbe01.WebUI', packageId: 'CppProbe01' } }; },
      launch(id, ok) { state.calls++; state.ready = true; ok(); }
    },
    messageport: {
      requestLocalMessagePort() { return { addMessagePortListener(fn) { state.listener = fn; return 1; }, removeMessagePortListener() { state.listener = null; } }; },
      requestRemoteMessagePort(appId, port) {
        if (options.denied) { const e = new Error('denied'); e.name = 'SecurityError'; throw e; }
        if (!state.ready) { const e = new Error('waiting'); e.name = 'NotFoundError'; throw e; }
        return { sendMessage(items) {
          const q = Object.fromEntries(items.map(x => [x.key, x.value]));
          const r = { protocol: '1', id: q.id, op: q.op, status: options.nativeError && q.op === 'add' ? 'error' : 'ok', runtime: 'tizen-native', message: 'pong' };
          if (q.op === 'add') { r.result = String(Number(q.a) + Number(q.b)); if (options.nativeError) { r.error = 'INVALID_OPERAND'; r.message = 'invalid'; } }
          if (options.drop && q.op !== 'ping') return;
          if (options.badId && q.op !== 'ping') r.id = 'not-a-pending-request';
          const sender = options.noSender && q.op !== 'ping' ? null : { appId: options.wrongSender && q.op !== 'ping' ? 'Other.Service' : appId, messagePortName: port };
          setTimeout(() => { if (state.listener) state.listener(Object.keys(r).map(key => ({ key, value: r[key] })), sender); }, 1);
        } };
      }
    }
  };
  return { w, state, bridge: new w.ProbeBridge(w.PROBE_SETTINGS) };
}
function connect(b) { return new Promise(resolve => b.connect((error, reply) => resolve({ error, reply }))); }
function request(b, op, data = {}) { return new Promise(resolve => b.request(op, data, (error, reply) => resolve({ error, reply }))); }
(async () => {
  const results = [];
  let e = environment({ noTizen: true });
  assert.equal((await connect(e.bridge)).error.code, 'NO_TIZEN');
  assert.equal(e.bridge.mode, 'native'); e.bridge.close(); results.push('No API: no demo fallback');
  e = environment({ wrongId: true }); assert.equal((await connect(e.bridge)).error.code, 'APP_ID_MISMATCH'); e.bridge.close(); results.push('App ID mismatch');
  e = environment({ denied: true }); assert.equal((await connect(e.bridge)).error.name, 'SecurityError'); e.bridge.close(); results.push('Original SecurityError preserved');
  e = environment({ ready: false }); assert.equal((await connect(e.bridge)).reply.message, 'pong'); assert.equal(e.state.calls, 1); e.bridge.close(); results.push('Launch then delayed port registration');
  e = environment(); assert.equal((await connect(e.bridge)).reply.runtime, 'tizen-native'); assert.equal((await request(e.bridge, 'add', { a: '12', b: '30' })).reply.result, '42'); e.bridge.close(); results.push('Correlated add response');
  e = environment({ nativeError: true }); await connect(e.bridge); assert.equal((await request(e.bridge, 'add', {a: 'x',b: '2'})).error.code, 'INVALID_OPERAND'); e.bridge.close(); results.push('Native error code preserved');
  for (const options of [{drop: true}, {badId: true}, {wrongSender: true}, {noSender: true}]) {
    e = environment(options); await connect(e.bridge);
    assert.equal((await request(e.bridge, 'probe')).error.code, 'TIMEOUT');
    assert.equal(e.bridge.connected, false); e.bridge.close(); results.push('Reject/timeout: ' + Object.keys(options)[0]);
  }
  e = environment({ noTizen: true }); e.bridge.setMode('demo');
  assert.equal((await connect(e.bridge)).reply.runtime, 'browser-demo');
  assert.equal((await request(e.bridge, 'probe')).reply.native_api, 'not-tested');
  assert.equal(e.w.ProbeBridge.parseInteger('000000000000001'), null); e.bridge.close(); results.push('Demo explicitly identifies untested native APIs');
  const summary = { scope: 'Node VM with fake MessagePort API; no DOM/browser/TV', checks: results, actualTizenSdkBuild: false, actualTvIpc: false };
  const output = path.resolve(__dirname, '../artifacts/bridge-test-results.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
