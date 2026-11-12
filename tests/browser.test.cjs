/* Local browser tests. The fake Tizen implementation below is NOT a TV runtime. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const launchOptions = { headless: true };
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOptions);
  const url = pathToFileURL(path.resolve(__dirname, '../web/index.html')).href;
  const checks = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  try {
    await page.goto(url);
    await page.click('#connect-native');
    assert.match(await page.textContent('#native-status'), /NO_TIZEN/);
    assert.equal((await page.evaluate(() => getProbeReport())).mode, 'native');
    checks.push('No Tizen: explicit error; no silent demo fallback');
    await page.click('#probe-web');
    assert.equal(await page.locator('#probe-results tr').count(), 6);
    await page.click('#demo-toggle');
    await page.click('#connect-native');
    await page.waitForFunction(() => document.getElementById('native-status').textContent.indexOf('데모 연결됨') >= 0);
    await page.click('#add-native');
    await page.waitForFunction(() => document.getElementById('sum-result').textContent === '42');
    await page.click('#probe-native');
    await page.waitForFunction(() => getProbeReport().native.lastProbe);
    let report = await page.evaluate(() => getProbeReport());
    assert.equal(report.native.transportConfirmed, false);
    assert.equal(report.native.apiProbeRun, false);
    assert.equal(report.native.lastProbe.runtime, 'browser-demo');
    checks.push('Demo add=42; native/API flags remain false');
    await page.fill('#input-a', '000000000000001');
    await page.click('#add-native');
    assert.equal(await page.textContent('#sum-result'), '입력 오류');
    checks.push('Overlong integer input rejected');
    await page.fill('#input-a', '12');
    await page.click('#add-native');
    await page.waitForFunction(() => document.getElementById('sum-result').textContent === '42');
    const artifactDir = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, 'browser-demo-qa.png'), fullPage: true });

    const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    tv.on('pageerror', e => pageErrors.push(e.message));
    await tv.addInitScript(() => {
      window.__fake = { ready: false, denied: false, wrongSender: false, badRuntime: false, launches: 0, listeners: {}, next: 1 };
      function namedError(name, message) { const e = new Error(message); e.name = name; return e; }
      window.tizen = {
        application: {
          getCurrentApplication() { return { appInfo: { id: 'CppProbe01.WebUI', packageId: 'CppProbe01' }, exit() {} }; },
          launch(id, ok) { __fake.launches++; setTimeout(() => { __fake.ready = true; ok(); }, 20); }
        },
        systeminfo: { getCapability(key) { return key.endsWith('platform.version') ? '3.0 MOCK' : true; } },
        messageport: {
          requestLocalMessagePort(name) {
            return { messagePortName: name, addMessagePortListener(fn) { const id = __fake.next++; __fake.listeners[id] = fn; this.listenerId = id; return id; }, removeMessagePortListener(id) { delete __fake.listeners[id]; } };
          },
          requestRemoteMessagePort(appId, port) {
            if (__fake.denied) throw namedError('SecurityError', 'MOCK denied');
            if (!__fake.ready) throw namedError('NotFoundError', 'MOCK not ready');
            return { appId, messagePortName: port, sendMessage(items, local) {
              const data = Object.fromEntries(items.map(x => [x.key, x.value]));
              const result = { protocol: '1', id: data.id, op: data.op, status: 'ok', runtime: __fake.badRuntime ? 'unexpected' : 'tizen-native' };
              if (data.op === 'ping') result.message = 'pong';
              if (data.op === 'add') result.result = String(Number(data.a) + Number(data.b));
              if (data.op === 'probe') { result.native_api = 'service_app,message_port,system_info'; result.model_name_status = 'ok'; result.model_name_value = 'MOCK ONLY'; }
              const sender = { appId: __fake.wrongSender ? 'wrong.App' : appId, messagePortName: port };
              setTimeout(() => {
                const listener = __fake.listeners[local.listenerId];
                if (listener) listener(Object.keys(result).map(key => ({ key, value: result[key] })), sender);
              }, 10);
            } };
          }
        }
      };
    });
    await tv.goto(url);
    await tv.evaluate(() => { PROBE_SETTINGS.requestTimeoutMs = 180; });
    assert.equal(await tv.isDisabled('#demo-toggle'), true);
    await tv.click('#probe-web');
    await tv.click('#connect-native');
    await tv.waitForFunction(() => getProbeReport().native.transportConfirmed);
    await tv.click('#add-native');
    await tv.waitForFunction(() => document.getElementById('sum-result').textContent === '42');
    await tv.click('#probe-native');
    await tv.waitForFunction(() => getProbeReport().native.apiProbeRun);
    assert.equal(await tv.evaluate(() => __fake.launches), 1);
    checks.push('MOCK Tizen: launch, port readiness, ping/add/probe routing');

    await tv.evaluate(() => { __fake.wrongSender = true; });
    await tv.click('#probe-native');
    await tv.waitForFunction(() => document.getElementById('log').textContent.indexOf('TIMEOUT') >= 0);
    assert.equal((await tv.evaluate(() => getProbeReport())).native.transportConfirmed, false);
    checks.push('MOCK Tizen: wrong sender ignored; timeout recorded');
    await tv.evaluate(() => { __fake.wrongSender = false; __fake.denied = true; });
    await tv.click('#connect-native');
    await tv.waitForFunction(() => document.getElementById('native-status').textContent.indexOf('SecurityError') >= 0);
    checks.push('MOCK Tizen: SecurityError retained, not converted to missing port');
    await tv.evaluate(() => { __fake.denied = false; });
    await tv.click('#connect-native');
    await tv.waitForFunction(() => getProbeReport().native.transportConfirmed);
    await tv.evaluate(() => { __fake.badRuntime = true; });
    await tv.click('#connect-native');
    await tv.waitForFunction(() => document.getElementById('native-status').textContent.indexOf('예상한 Native') >= 0);
    assert.equal((await tv.evaluate(() => getProbeReport())).native.transportConfirmed, false);
    checks.push('MOCK Tizen: runtime mismatch clears previous success');
    assert.deepEqual(pageErrors, []);
    checks.push('No browser page errors');
    const summary = { scope: 'Desktop Chromium UI and fake Tizen adapter only', checks, actualTizenSdkBuild: false, actualTvIpc: false };
    const output = path.resolve(__dirname, '../artifacts/browser-test-results.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
