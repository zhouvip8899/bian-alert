/**
 * 会员认证模块 auth.js
 * 依赖 auth-config.js（需同级目录）
 * 包含 SHA-256 验证 + 登录蒙层控制
 * 
 * 使用方式：页面引入 <script src="auth-config.js"></script> 和 <script src="auth.js"></script>
 * 页面需要有以下元素：
 *   <div id="authGate" style="display:none">...</div>
 *   <input id="authInput" ...>
 *   <div id="authErr"></div>
 *   <div id="authExpire"></div>
 * CSS 样式需页面自行定义
 */
(function() {
    const LS_AUTH = 'bian-auth-v1';

    async function sha256(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2,'0')).join('');
    }

    function getStored() {
        try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch { return null; }
    }

    function setStored(hash, expire) {
        localStorage.setItem(LS_AUTH, JSON.stringify({ hash, expire, ts: Date.now() }));
    }

    function getConfig() {
        return (window.AUTH_CONFIG && Array.isArray(window.AUTH_CONFIG.keys)) ? window.AUTH_CONFIG.keys : [];
    }

    function findKey(hash) {
        return getConfig().find(function(k) { return k.hash === hash; }) || null;
    }

    function showGate(msg) {
        var gate = document.getElementById('authGate');
        if (gate) gate.style.display = 'flex';
        if (msg) {
            var el = document.getElementById('authExpire');
            if (el) el.textContent = msg;
        }
        // 隐藏主内容防止窥探
        var main = document.getElementById('mainWrap');
        if (main) main.style.display = 'none';
    }

    function hideGate(expire) {
        var gate = document.getElementById('authGate');
        if (gate) gate.style.display = 'none';
        var main = document.getElementById('mainWrap');
        if (main) main.style.display = '';
        if (expire && expire > 0) {
            var days = Math.ceil((expire - Date.now()) / 86400000);
            var bar = document.getElementById('status');
            if (bar) {
                setTimeout(function() {
                    if (bar.textContent.indexOf('剩余') === -1) {
                        bar.textContent = bar.textContent + ' · 授权剩余 ' + days + ' 天';
                    }
                }, 500);
            }
        }
    }

    window.initAuth = async function() {
        var cfg = getConfig();
        if (!cfg || cfg.length === 0) {
            console.warn('[Auth] auth-config.js 无授权码配置，调试放行');
            return;
        }
        var stored = getStored();
        if (stored && stored.hash) {
            var entry = findKey(stored.hash);
            if (entry) {
                var now = Date.now();
                var expireOk = entry.expire === 0 || entry.expire > now;
                if (expireOk) { hideGate(entry.expire); return; }
                showGate('⏰ 授权码已到期，请联系管理员获取新授权码');
                return;
            }
        }
        showGate('');
    };

    window.doAuth = async function() {
        var raw = (document.getElementById('authInput').value || '').trim().toUpperCase();
        var errEl = document.getElementById('authErr');
        if (!raw) { errEl.textContent = '请输入授权码'; return; }
        errEl.textContent = '验证中…';
        var hash = await sha256(raw);
        var entry = findKey(hash);
        if (!entry) {
            errEl.textContent = '❌ 授权码无效，请检查后重试';
            return;
        }
        var now = Date.now();
        if (entry.expire > 0 && entry.expire < now) {
            errEl.textContent = '❌ 授权码已过期，请联系管理员';
            return;
        }
        setStored(hash, entry.expire);
        errEl.textContent = '';
        hideGate(entry.expire);
    };

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { window.initAuth(); });
    } else {
        window.initAuth();
    }
})();
