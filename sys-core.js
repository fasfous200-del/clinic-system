/* sys-core.js
 * 1) توقيت القدس مربوط بالشبكة العالمية (يعمل بدون نت بآخر فرق محفوظ)
 * 2) تفعيل الحفظ المحلي لـ Firestore: البيانات تُحفظ على الجهاز وتُرسل تلقائياً عند عودة النت
 * 3) شريط حالة الاتصال والعمليات المعلقة
 * يُحمَّل مباشرة بعد تعريف const db = firebase.firestore();
 */
(function () {
    'use strict';
    var WORLD_TZ = 'Asia/Jerusalem';
    var RealDate = Date;
    var OFFSET_KEY = 'sys_time_offset_ms';
    var offset = Number(localStorage.getItem(OFFSET_KEY)) || 0;
    var synced = false;

    /* ---------- 1) الوقت ---------- */
    function NewDate() {
        if (!new.target) return new RealDate(RealDate.now() + offset).toString();
        if (arguments.length === 0) return new RealDate(RealDate.now() + offset);
        return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
    }
    NewDate.prototype = RealDate.prototype;
    NewDate.now = function () { return RealDate.now() + offset; };
    NewDate.parse = RealDate.parse;
    NewDate.UTC = RealDate.UTC;
    window.Date = NewDate;

    // العرض الافتراضي بتوقيت القدس بغض النظر عن توقيت الجهاز
    ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function (fn) {
        var orig = RealDate.prototype[fn];
        RealDate.prototype[fn] = function (loc, opts) {
            opts = Object.assign({}, opts || {});
            if (!opts.timeZone) opts.timeZone = WORLD_TZ;
            return orig.call(this, loc, opts);
        };
    });

    function fetchJson(url, ms) {
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, ms);
        return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
    }

    var sources = [
        function () { return fetchJson('https://worldtimeapi.org/api/timezone/Asia/Jerusalem', 4000).then(function (j) { return RealDate.parse(j.utc_datetime); }); },
        function () { return fetchJson('https://timeapi.io/api/Time/current/zone?timeZone=UTC', 4000).then(function (j) { return RealDate.parse(j.dateTime.slice(0, 23) + 'Z'); }); }
    ];

    function sync() {
        if (!navigator.onLine) { return Promise.resolve(synced); }
        var i = 0;
        function next() {
            if (i >= sources.length) return Promise.resolve(false);
            var src = sources[i++];
            var t0 = RealDate.now();
            return src().then(function (serverMs) {
                var t1 = RealDate.now();
                if (isNaN(serverMs)) return next();
                offset = serverMs + (t1 - t0) / 2 - t1;
                localStorage.setItem(OFFSET_KEY, String(offset));
                synced = true;
                return true;
            }, next);
        }
        return next();
    }

    function parts(d) {
        var p = {};
        new Intl.DateTimeFormat('en-GB', {
            timeZone: WORLD_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
        return p;
    }

    window.SysTime = {
        ready: sync(),
        sync: sync,
        synced: function () { return synced || offset !== 0; },
        now: function () { return new Date(); },
        today: function () { var p = parts(); return p.year + '-' + p.month + '-' + p.day; },
        time: function () { var p = parts(); return p.hour + ':' + p.minute; },
        parts: parts
    };
    setInterval(sync, 5 * 60 * 1000);

    /* ---------- 2) الحفظ دون اتصال ---------- */
    var pending = 0;

    function capWait(p) {
        // الكتابة تُحفظ محلياً فوراً؛ لا نعلّق الواجهة بانتظار تأكيد الخادم
        pending++; render();
        var settled = false;
        var done = function () { if (!settled) { settled = true; pending = Math.max(0, pending - 1); render(); } };
        p.then(done, done);
        var wait = navigator.onLine ? 8000 : 150;
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { resolve(); }, wait);
            p.then(function (v) { clearTimeout(timer); resolve(v); },
                   function (e) { clearTimeout(timer); reject(e); });
        });
    }

    function patch(proto, name) {
        if (!proto || !proto[name] || proto[name].__sysPatched) return;
        var orig = proto[name];
        var fn = function () { return capWait(orig.apply(this, arguments)); };
        fn.__sysPatched = true;
        proto[name] = fn;
    }

    function initOffline() {
        if (typeof db === 'undefined' || !window.firebase || !firebase.firestore) return;
        try {
            db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
                console.warn('Firestore persistence:', err && err.code);
            });
        } catch (e) { console.warn(e); }
        var F = firebase.firestore;
        patch(F.DocumentReference && F.DocumentReference.prototype, 'set');
        patch(F.DocumentReference && F.DocumentReference.prototype, 'update');
        patch(F.DocumentReference && F.DocumentReference.prototype, 'delete');
        patch(F.CollectionReference && F.CollectionReference.prototype, 'add');
        patch(F.WriteBatch && F.WriteBatch.prototype, 'commit');
    }
    initOffline();

    /* ---------- 3) شريط الحالة ---------- */
    var bar;
    function ensureBar() {
        if (bar || !document.body) return bar;
        bar = document.createElement('div');
        bar.setAttribute('dir', 'rtl');
        bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483000;padding:8px 14px;border-radius:8px;' +
            'font:bold 0.82rem Tahoma,sans-serif;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.25);display:none;max-width:90vw;';
        document.body.appendChild(bar);
        return bar;
    }
    var hideTimer;
    function show(text, color, autoHide) {
        if (!ensureBar()) return;
        clearTimeout(hideTimer);
        bar.textContent = text; bar.style.background = color; bar.style.display = 'block';
        if (autoHide) hideTimer = setTimeout(function () { bar.style.display = 'none'; }, autoHide);
    }
    function render() {
        if (!navigator.onLine) {
            show('⚠️ لا يوجد اتصال بالإنترنت — البيانات تُحفظ على الجهاز وسترسل تلقائياً عند عودة الاتصال' +
                (pending ? ' (' + pending + ' عملية معلّقة)' : ''), '#c0392b');
        } else if (pending > 0) {
            show('🔄 جاري مزامنة ' + pending + ' عملية مع السحاب...', '#e67e22');
        } else if (bar && bar.style.display === 'block') {
            show('✔ الاتصال متوفر وتمت مزامنة البيانات', '#27ae60', 3000);
        }
    }
    window.addEventListener('online', function () { sync(); render(); });
    window.addEventListener('offline', render);
    document.addEventListener('DOMContentLoaded', function () { ensureBar(); render(); });
})();

