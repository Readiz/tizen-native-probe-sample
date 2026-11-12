/* ES5: no Promise, fetch, modules, or modern syntax required. */
(function (global) {
    'use strict';
    function makeError(code, message) { var e = new Error(message); e.code = code; return e; }
    function fieldsToItems(fields) {
        var result = [], key;
        for (key in fields) {
            if (Object.prototype.hasOwnProperty.call(fields, key)) {
                result.push({ key: key, value: String(fields[key]) });
            }
        }
        return result;
    }
    function itemsToFields(items) {
        var result = Object.create(null), i, item;
        if (!items || items.length > 80) { return null; }
        for (i = 0; i < items.length; i += 1) {
            item = items[i];
            if (!item || typeof item.key !== 'string' || typeof item.value !== 'string' ||
                item.key.length > 80 || item.value.length > 4096 ||
                Object.prototype.hasOwnProperty.call(result, item.key)) { return null; }
            result[item.key] = item.value;
        }
        return result;
    }
    function parseInteger(text) {
        if (typeof text !== 'string' || !/^-?[0-9]+$/.test(text) || text.length > 11) { return null; }
        var value = Number(text);
        if (!isFinite(value) || Math.floor(value) !== value || Math.abs(value) > 1000000000) { return null; }
        return value;
    }
    function Bridge(settings, logger) {
        this.settings = settings;
        this.log = logger || function () {};
        this.mode = 'native';
        this.connected = false;
        this.localPort = null;
        this.remotePort = null;
        this.watchId = null;
        this.sequence = 0;
        this.pending = Object.create(null);
        this.pollTimer = null;
        this.connectCallback = null;
        this.connectAttempt = 0;
    }
    Bridge.prototype.close = function () {
        var key, entry, callback = this.connectCallback;
        this.connectAttempt += 1;
        this.connectCallback = null;
        if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null; }
        if (this.localPort && this.watchId !== null) {
            try { this.localPort.removeMessagePortListener(this.watchId); } catch (ignored) {}
        }
        this.localPort = null; this.remotePort = null; this.watchId = null; this.connected = false;
        for (key in this.pending) {
            if (Object.prototype.hasOwnProperty.call(this.pending, key)) {
                entry = this.pending[key]; clearTimeout(entry.timer); delete this.pending[key];
                entry.callback(makeError('CANCELLED', '연결이 종료되었습니다.'));
            }
        }
        if (callback) { callback(makeError('CANCELLED', '연결 시도가 종료되었습니다.')); }
    };
    Bridge.prototype.setMode = function (mode) {
        if (mode !== 'native' && mode !== 'demo') { throw makeError('MODE', '알 수 없는 실행 모드'); }
        this.close(); this.mode = mode;
    };
    Bridge.prototype.initLocalPort = function () {
        var self = this, t = global.tizen, info;
        if (!t || !t.messageport) { throw makeError('NO_TIZEN', 'Tizen MessagePort API가 없습니다. TV에서 Web 앱으로 실행하세요.'); }
        if (t.application && typeof t.application.getCurrentApplication === 'function') {
            info = t.application.getCurrentApplication().appInfo;
            if (info.id !== this.settings.webAppId || info.packageId !== this.settings.packageId) {
                throw makeError('APP_ID_MISMATCH', '현재 Web application/package ID와 샘플 설정이 다릅니다.');
            }
        }
        if (this.localPort) { return; }
        this.localPort = t.messageport.requestLocalMessagePort(this.settings.replyPortPrefix + new Date().getTime() + '_' + Math.floor(Math.random() * 100000));
        this.watchId = this.localPort.addMessagePortListener(function (items, sender) {
            var fields = itemsToFields(items), entry;
            if (!sender || sender.appId !== self.settings.nativeAppId || sender.messagePortName !== self.settings.servicePort) {
                self.log('응답 무시: Native sender appId/port를 확인할 수 없습니다.'); return;
            }
            if (!fields || fields.protocol !== '1' || !fields.id) { self.log('응답 무시: 프로토콜 형식 오류'); return; }
            entry = self.pending[fields.id];
            if (!entry || fields.op !== entry.op) { self.log('응답 무시: 일치하는 요청이 없습니다.'); return; }
            clearTimeout(entry.timer); delete self.pending[fields.id];
            if (fields.status === 'ok') { entry.callback(null, fields); }
            else { entry.callback(makeError(fields.error_code || fields.code || fields.error || 'NATIVE_ERROR', fields.error_message || fields.message || 'Native 오류'), fields); }
        });
    };
    Bridge.prototype.connect = function (callback) {
        var self = this, start, attempt;
        if (this.connectCallback) { callback(makeError('BUSY', '이미 연결을 확인하고 있습니다.')); return; }
        if (this.mode === 'demo') {
            this.connected = true;
            this.request('ping', {}, callback); return;
        }
        try { this.initLocalPort(); }
        catch (e) { callback(e); return; }
        this.connectAttempt += 1;
        attempt = this.connectAttempt;
        function complete(error) {
            if (self.connectAttempt !== attempt) { return; }
            var cb = self.connectCallback;
            self.connectCallback = null;
            if (self.pollTimer !== null) { clearTimeout(self.pollTimer); self.pollTimer = null; }
            if (!cb) { return; }
            if (error) { self.connected = false; cb(error); return; }
            self.connected = true;
            self.request('ping', {}, function (err, fields) {
                if (self.connectAttempt !== attempt) { cb(makeError('CANCELLED', '이전 연결 시도가 취소되었습니다.')); return; }
                if (err) { self.connected = false; }
                cb(err, fields);
            });
        }
        function findPort() {
            try {
                self.remotePort = global.tizen.messageport.requestRemoteMessagePort(self.settings.nativeAppId, self.settings.servicePort);
                return true;
            } catch (e) {
                if (e.name === 'NotFoundError') { return false; }
                throw e;
            }
        }
        function poll() {
            if (self.connectAttempt !== attempt || !self.connectCallback) { return; }
            try { if (findPort()) { complete(null); return; } }
            catch (e) { complete(e); return; }
            if (new Date().getTime() - start >= self.settings.launchTimeoutMs) {
                complete(makeError('PORT_NOT_READY', '서비스 포트가 등록되지 않았습니다. Native 설치, app ID, 서비스 시작 로그를 확인하세요.')); return;
            }
            self.pollTimer = setTimeout(poll, 150);
        }
        this.connectCallback = callback;
        try { if (findPort()) { complete(null); return; } }
        catch (e) { complete(e); return; }
        if (!global.tizen.application || typeof global.tizen.application.launch !== 'function') {
            complete(makeError('NO_LAUNCH_API', 'application.launch API가 없습니다. 내부 SDK의 서비스 실행 경로를 확인하세요.')); return;
        }
        start = new Date().getTime();
        /* Poll independently so a missing launch callback cannot leave the UI pending forever. */
        this.pollTimer = setTimeout(poll, 150);
        try {
            global.tizen.application.launch(this.settings.nativeAppId, function () {
                if (self.connectAttempt !== attempt || !self.connectCallback) { return; }
                self.log('서비스 launch callback 수신. MessagePort 등록을 기다립니다.');
            }, function (e) {
                complete(makeError(e.name || 'LAUNCH_FAILED', '서비스 실행 실패: ' + (e.message || e.name || String(e))));
            });
        } catch (e) { complete(e); }
    };
    Bridge.prototype.request = function (op, data, callback) {
        var self = this, id, fields, timer, a, b, reply;
        if (!this.connected) { callback(makeError('NOT_CONNECTED', '먼저 Native 연결을 실행하세요.')); return; }
        this.sequence += 1;
        id = 'req_' + new Date().getTime() + '_' + this.sequence;
        fields = {protocol: '1', id: id, op: op};
        if (op === 'add') { fields.a = String(data.a); fields.b = String(data.b); }
        timer = setTimeout(function () {
            var entry = self.pending[id];
            if (entry) {
                delete self.pending[id]; self.connected = false;
                entry.callback(makeError('TIMEOUT', 'Native 응답 시간이 초과되었습니다. 서비스 종료나 응답 경로를 확인하세요.'));
            }
        }, this.settings.requestTimeoutMs);
        this.pending[id] = {op: op, callback: callback, timer: timer};
        this.log('[' + this.mode + '] 요청 ' + id + ' / ' + op);
        if (this.mode === 'demo') {
            reply = {protocol: '1', id: id, op: op, status: 'ok', runtime: 'browser-demo', simulated: 'true'};
            if (op === 'ping') { reply.message = 'pong (simulated)'; }
            else if (op === 'add') {
                a = parseInteger(fields.a); b = parseInteger(fields.b);
                if (a === null || b === null) { reply.status = 'error'; reply.error_code = 'INVALID_OPERAND'; reply.error_message = '각 값은 -1000000000..1000000000 범위의 정수여야 합니다.'; }
                else { reply.result = String(a + b); }
            } else if (op === 'probe') {
                reply.native_api = 'not-tested'; reply.architecture = 'not-tested'; reply.sdk_build_label = 'not-built';
                reply.note = '브라우저 모의 응답입니다. Native API를 호출하지 않았습니다.';
            } else { reply.status = 'error'; reply.error_code = 'UNKNOWN_OP'; reply.error_message = '지원하지 않는 작업'; }
            setTimeout(function () {
                var entry = self.pending[id];
                if (!entry) { return; }
                clearTimeout(entry.timer); delete self.pending[id];
                if (reply.status === 'ok') { entry.callback(null, reply); }
                else { entry.callback(makeError(reply.error_code, reply.error_message), reply); }
            }, 80);
            return;
        }
        try {
            this.remotePort.sendMessage(fieldsToItems(fields), this.localPort);
        } catch (e) {
            clearTimeout(timer); delete this.pending[id]; this.connected = false; callback(e);
        }
    };
    Bridge.parseInteger = parseInteger;
    global.ProbeBridge = Bridge;
}(window));
