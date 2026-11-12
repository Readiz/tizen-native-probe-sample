(function (global) {
    'use strict';
    var settings = global.PROBE_SETTINGS;
    var hasTizen = typeof global.tizen !== 'undefined';
    var evidence = [], history = [], bridge, mode = 'native';
    var report = {
        schema: 'tizen-native-probe/1', createdAt: new Date().toISOString(),
        environment: {tizenObjectPresent: hasTizen, userAgent: navigator.userAgent},
        mode: 'native', configuredIds: settings,
        native: {transportConfirmed: false, apiProbeRun: false, note: 'Native 미검증'},
        evidence: evidence, events: history
    };
    function el(id) { return document.getElementById(id); }
    function text(node, value) { node.textContent = String(value); }
    function errorText(e) { return (e.code || e.name || 'Error') + ': ' + (e.message || String(e)); }
    function log(message, details) {
        var item = {time: new Date().toISOString(), mode: mode, message: message};
        if (details) { item.details = details; }
        history.push(item);
        if (history.length > 100) { history.shift(); }
        text(el('log'), history.map(function (x) { return x.time.slice(11, 19) + ' [' + x.mode + '] ' + x.message; }).join('\n'));
        el('log').scrollTop = el('log').scrollHeight;
        refreshReport();
    }
    function status(id, message, kind) { text(el(id), message); el(id).className = 'status ' + (kind || ''); }
    function renderEvidence() {
        var body = el('probe-results'), i, row, a, b, c;
        while (body.firstChild) { body.removeChild(body.firstChild); }
        for (i = 0; i < evidence.length; i += 1) {
            row = document.createElement('tr');
            a = document.createElement('td'); b = document.createElement('td'); c = document.createElement('td');
            text(a, evidence[i].name); text(b, evidence[i].stage); text(c, evidence[i].detail);
            c.className = evidence[i].kind;
            row.appendChild(a); row.appendChild(b); row.appendChild(c); body.appendChild(row);
        }
        refreshReport();
    }
    function addEvidence(group, name, stage, kind, detail) {
        evidence.push({group: group, name: name, stage: stage, kind: kind, detail: String(detail), mode: mode});
    }
    function clearGroup(group) {
        var i;
        for (i = evidence.length - 1; i >= 0; i -= 1) { if (evidence[i].group === group) { evidence.splice(i, 1); } }
    }
    function refreshReport() {
        report.mode = mode;
        if (!el('report-text').classList.contains('hidden')) { el('report-text').value = JSON.stringify(report, null, 2); }
    }
    function probePresence(path, note) {
        var parts = path.split('.'), obj = global, i;
        try {
            for (i = 0; i < parts.length; i += 1) { obj = obj === null || obj === undefined ? undefined : obj[parts[i]]; }
            addEvidence('web', path, '객체 존재', 'note', (obj !== undefined && obj !== null ? '있음 / 호출 미검증' : '없음') + (note ? ' — ' + note : ''));
        } catch (e) { addEvidence('web', path, '객체 접근', 'bad', errorText(e)); }
    }
    function probeCall(name, fn) {
        try { addEvidence('web', name, '읽기 API 호출', 'ok', '호출 성공: ' + JSON.stringify(fn())); }
        catch (e) { addEvidence('web', name, '읽기 API 호출', 'bad', errorText(e)); }
    }
    function runWebProbe() {
        var t = global.tizen, keys, i;
        clearGroup('web');
        probePresence('tizen.application');
        probePresence('tizen.application.launch');
        probePresence('tizen.messageport');
        probePresence('tizen.systeminfo');
        probePresence('tizen.filesystem', '파일 접근은 실행하지 않음');
        probePresence('tizen.keymanager', '인하우스 정책과 실기 호출을 별도 확인');
        if (t && t.application && typeof t.application.getCurrentApplication === 'function') {
            probeCall('application.getCurrentApplication', function () {
                var info = t.application.getCurrentApplication().appInfo;
                return {id: info.id, packageId: info.packageId};
            });
        }
        if (t && t.systeminfo && typeof t.systeminfo.getCapability === 'function') {
            keys = ['http://tizen.org/feature/platform.version', 'http://tizen.org/feature/web.service'];
            for (i = 0; i < keys.length; i += 1) {
                (function (key) { probeCall('getCapability: ' + key.replace('http://tizen.org/feature/', ''), function () { return t.systeminfo.getCapability(key); }); }(keys[i]));
            }
        }
        status('web-status', hasTizen ? '객체 존재와 실제 호출 결과를 기록했습니다.' : '브라우저 확인 완료 / TV API 미검증', hasTizen ? '' : 'bad');
        renderEvidence(); log('Web API 진단 완료. API 객체의 존재와 호출 성공을 구분했습니다.');
    }
    function showMode() {
        var demo = mode === 'demo';
        text(el('mode-badge'), demo ? 'DEMO / Native 미검증' : (hasTizen ? 'TIZEN / 실기 확인 모드' : 'BROWSER / Native 미검증'));
        el('mode-badge').className = 'badge' + (demo ? ' demo' : '');
        el('mode-notice').className = 'notice' + (demo ? ' demo' : '');
        text(el('mode-notice'), demo ? '모의 실행 중입니다. 계산과 응답은 JavaScript 데모이며, C++ 또는 Tizen Native API를 실행하지 않습니다.' :
            (hasTizen ? '현재 설치된 Web 앱에서 진단합니다. Native 연결 성공 후에도 각 API의 호출 결과를 따로 확인하세요.' : '브라우저에서는 화면과 요청 흐름을 확인할 수 있습니다. 실제 Native 연결에는 TV에 설치한 하이브리드 패키지가 필요합니다.'));
        text(el('demo-toggle'), demo ? 'Native 확인 모드로 전환' : '브라우저 데모 시작');
        text(el('connect-native'), demo ? '데모 연결' : 'Native 연결');
        el('demo-toggle').disabled = hasTizen;
    }
    function connect() {
        var requestedMode = mode;
        report.native.transportConfirmed = false;
        report.native.note = '연결 확인 중';
        status('native-status', mode === 'demo' ? '모의 응답을 기다립니다.' : '서비스 실행과 포트 등록을 확인합니다.');
        el('connect-native').disabled = true;
        bridge.connect(function (err, fields) {
            if (requestedMode !== mode) { return; }
            el('connect-native').disabled = false;
            clearGroup('ping');
            if (err) {
                report.native.transportConfirmed = false;
                report.native.note = errorText(err);
                status('native-status', errorText(err), 'bad');
                addEvidence('ping', 'Native ping', '실제 왕복 통신', 'bad', errorText(err));
                log('연결 실패: ' + errorText(err));
            } else if (mode === 'native' && fields.runtime !== 'tizen-native') {
                bridge.close();
                report.native.transportConfirmed = false;
                report.native.note = 'Native runtime 응답 불일치';
                status('native-status', '예상한 Native 런타임 응답이 아닙니다.', 'bad');
                addEvidence('ping', 'Native ping', '런타임 확인', 'bad', 'runtime=' + fields.runtime);
                log('런타임 응답 불일치', fields);
            } else {
                report.native.transportConfirmed = mode === 'native';
                report.native.note = mode === 'native' ? 'Native ping 응답 수신' : '모의 응답만 확인';
                status('native-status', mode === 'native' ? 'Native ping 응답 확인' : '데모 연결됨 / Native 미검증', mode === 'native' ? 'ok' : '');
                addEvidence('ping', 'Native ping', mode === 'native' ? '실제 왕복 통신' : '브라우저 모의 응답', mode === 'native' ? 'ok' : 'note', fields.message || 'pong');
                log(mode === 'native' ? 'Native ping 응답 수신' : '모의 ping 응답 수신', fields);
            }
            renderEvidence();
        });
    }
    function request(op) {
        var requestedMode = mode, data = {}, a, b;
        if (op === 'add') {
            a = el('input-a').value; b = el('input-b').value;
            if (global.ProbeBridge.parseInteger(a) === null || global.ProbeBridge.parseInteger(b) === null) {
                text(el('sum-result'), '입력 오류');
                log('각 입력은 -1000000000..1000000000 범위의 정수여야 합니다. 공백과 소수는 허용하지 않습니다.'); return;
            }
            data.a = a; data.b = b;
        }
        bridge.request(op, data, function (err, fields) {
            var key, label = mode === 'native' ? 'Native' : 'Demo';
            if (requestedMode !== mode) { return; }
            clearGroup(op);
            if (err) {
                if (!bridge.connected) { report.native.transportConfirmed = false; status('native-status', '연결을 다시 확인하세요.', 'bad'); }
                addEvidence(op, label + ' ' + op, '요청 결과', 'bad', errorText(err));
                log('요청 실패: ' + errorText(err), fields); renderEvidence(); return;
            }
            log(label + ' ' + op + ' 응답 수신', fields);
            if (op === 'add') {
                text(el('sum-result'), fields.result);
                addEvidence(op, label + ' add', mode === 'native' ? 'C++ 처리 결과' : 'JavaScript 모의 계산', mode === 'native' ? 'ok' : 'note', data.a + ' + ' + data.b + ' = ' + fields.result);
            } else {
                report.native.apiProbeRun = mode === 'native';
                report.native.lastProbe = fields;
                for (key in fields) {
                    if (Object.prototype.hasOwnProperty.call(fields, key) && key !== 'id' && key !== 'protocol' && key !== 'status' && key !== 'op') {
                        addEvidence(op, label + '.' + key, mode === 'native' ? 'Native 진단 응답' : '모의 응답', 'note', fields[key]);
                    }
                }
            }
            renderEvidence();
        });
    }
    function changeMode() {
        if (hasTizen) { return; }
        mode = mode === 'native' ? 'demo' : 'native';
        bridge.setMode(mode);
        clearGroup('ping'); clearGroup('probe'); clearGroup('add');
        report.native = {transportConfirmed: false, apiProbeRun: false, note: mode === 'demo' ? '모의 실행' : 'Native 미검증'};
        text(el('sum-result'), '—'); status('native-status', mode === 'demo' ? '데모 모드 / Native 미검증' : 'Native 미검증');
        el('connect-native').disabled = false;
        showMode(); renderEvidence(); log('실행 모드 변경: ' + mode);
    }
    function exportReport() {
        var blob, url, anchor;
        el('report-text').classList.remove('hidden'); refreshReport();
        if (!global.Blob || !global.URL || !global.URL.createObjectURL) { log('파일 저장 API가 없습니다. 화면의 JSON을 복사하세요.'); return; }
        blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'});
        url = global.URL.createObjectURL(blob); anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'tizen-probe-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
        setTimeout(function () { global.URL.revokeObjectURL(url); }, 10000);
        log('JSON 저장 요청. TV에서 다운로드가 지원되지 않으면 표시된 JSON을 복사하세요.');
    }
    bridge = new global.ProbeBridge(settings, log);
    el('probe-web').onclick = runWebProbe;
    el('connect-native').onclick = connect;
    el('add-native').onclick = function () { request('add'); };
    el('probe-native').onclick = function () { request('probe'); };
    el('demo-toggle').onclick = changeMode;
    el('show-report').onclick = function () { el('report-text').classList.toggle('hidden'); refreshReport(); };
    el('download-report').onclick = exportReport;
    document.addEventListener('keydown', function (e) {
        var key = e.keyCode, controls, active = document.activeElement, usable = [], i, position, next;
        if (key === 10009 && hasTizen && global.tizen.application) {
            try { global.tizen.application.getCurrentApplication().exit(); } catch (ex) { log(errorText(ex)); } return;
        }
        if (key < 37 || key > 40 || active.tagName === 'TEXTAREA') { return; }
        if (active.tagName === 'INPUT' && (key === 37 || key === 39)) { return; }
        controls = document.querySelectorAll('button,input,textarea');
        for (i = 0; i < controls.length; i += 1) { if (!controls[i].disabled && controls[i].offsetHeight > 0) { usable.push(controls[i]); } }
        if (!usable.length) { return; }
        position = usable.indexOf(active); next = key === 37 || key === 38 ? position - 1 : position + 1;
        if (next < 0) { next = usable.length - 1; } if (next >= usable.length) { next = 0; }
        usable[next].focus(); usable[next].scrollIntoView(false); e.preventDefault();
    });
    global.addEventListener('unload', function () { bridge.close(); });
    showMode(); el('probe-web').focus();
    /* Read-only hook for automated UI checks; no device API is exposed through it. */
    global.getProbeReport = function () { return JSON.parse(JSON.stringify(report)); };
}(window));
