/**
 * ================================================
 * 币安合约分析系统 - 共享库 v1.0
 * ================================================
 * 包含：CORS代理、API请求、工具函数、TA技术指标库、三维评分系统
 * ================================================
 */

(function(global) {
    'use strict';

    // ========== 配置 ==========
    const API = 'https://fapi.binance.com';
    
    // CORS代理列表（按优先级排序）
    const CORS_PROXIES = [
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://yacdn.org/proxy/'
    ];
    let currentProxyIndex = 0;

    // ========== 工具函数 ==========
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (isNaN(n) || n === null || n === undefined) ? '-' : Number(n).toFixed(d);
    const fp = n => (isNaN(n) || n === null || n === undefined) ? '-' : Number(n).toFixed(5); // 价格保留5位
    const fv = v => v > 1e9 ? (v / 1e9).toFixed(1) + 'B' : v > 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(1) + 'K';
    const fc = n => (n === null || n === undefined || isNaN(n)) ? '<span class="down">-</span>' : (n >= 0 ? `<span class="up">+${fmt(n)}%</span>` : `<span class="down">${fmt(n)}%</span>`);
    const err = msg => { const el = $('err'); if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 10000); }};
    const setProgress = (pct, text) => { const bar = $('bar'); if (bar) { bar.style.width = pct + '%'; bar.textContent = pct + '%'; } if (text) { const status = $('status'); if (status) status.textContent = text; } };
    const safeMin = arr => arr.reduce((a, b) => a < b ? a : b, Infinity);
    const safeMax = arr => arr.reduce((a, b) => a > b ? a : b, -Infinity);

    // ========== API请求 (直连优先，失败自动切换代理) ==========
    async function apiFetch(path, timeout = 20000) {
        const url = API + path;
        
        // 第一步：尝试直连
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeout);
            const r = await window.fetch(url, { signal: ctrl.signal });
            clearTimeout(timer);
            if (r.ok) return await r.json();
            console.warn('直连响应异常:', r.status, '切换代理...');
        } catch (e) {
            console.warn('直连失败:', e.name === 'AbortError' ? '超时' : e.message);
        }
        
        // 第二步：使用CORS代理
        let lastError = null;
        for (let attempt = 0; attempt < CORS_PROXIES.length; attempt++) {
            currentProxyIndex = attempt;
            const proxyUrl = CORS_PROXIES[attempt] + encodeURIComponent(url);
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), timeout);
                const r = await window.fetch(proxyUrl, { signal: ctrl.signal });
                clearTimeout(timer);
                if (r.ok) {
                    console.log('代理成功:', CORS_PROXIES[attempt].split('?')[0]);
                    return await r.json();
                }
                lastError = 'HTTP ' + r.status;
            } catch (e) {
                lastError = e.name === 'AbortError' ? '超时' : e.message;
                console.warn(`代理${attempt + 1}失败:`, lastError);
            }
        }
        
        throw new Error('请求失败: ' + lastError);
    }

    // ========== TA技术指标库 (增强版) ==========
    const TA = {
        // RSI
        rsi: (c, p = 14) => {
            if (c.length < p + 1) return null;
            let g = 0, l = 0;
            for (let i = c.length - p; i < c.length; i++) {
                const d = c[i] - c[i - 1];
                if (d > 0) g += d; else l -= d;
            }
            const al = l / p;
            return al === 0 ? 100 : 100 - (100 / (1 + g / p / al));
        },
        
        // EMA
        ema: (c, p) => {
            if (c.length < p) return null;
            const k = 2 / (p + 1);
            let e = c.slice(0, p).reduce((a, b) => a + b) / p;
            for (let i = p; i < c.length; i++) e = c[i] * k + e * (1 - k);
            return e;
        },
        
        // MACD
        macd: (c) => {
            const e12 = TA.ema(c, 12), e26 = TA.ema(c, 26), e9 = TA.ema(c, 9);
            if (!e12 || !e26) return null;
            const dif = e12 - e26;
            const dea = e9 || dif;
            return { dif, macd: dif * 2, hist: dif - dea, signal: e9 };
        },
        
        // 布林带
        bb: c => {
            if (c.length < 20) return null;
            const r = c.slice(-20), sma = r.reduce((a, b) => a + b) / 20;
            const std = Math.sqrt(r.reduce((s, x) => s + (x - sma) ** 2, 0) / 20);
            const upper = sma + 2 * std, lower = sma - 2 * std;
            const latest = c[c.length - 1];
            return { w: (std / sma) * 100, upper, lower, sma, pos: (latest - sma) / (upper - lower) * 100 };
        },
        
        // KDJ
        kdj: (c, p = 9) => {
            if (c.length < p * 2) return null;
            const recent = c.slice(-p * 3);
            const low = safeMin(recent), high = safeMax(recent);
            if (high === low) return null;
            const rsv = (c[c.length - 1] - low) / (high - low) * 100;
            return { k: rsv * 2 / 3 + 50 / 3, d: rsv * 1 / 3 + 50 * 2 / 3, j: 3 * rsv - 2 * 50 };
        },
        
        // Williams %R
        wr: (c, p = 14) => {
            if (c.length < p) return null;
            const recent = c.slice(-p);
            const high = safeMax(recent), low = safeMin(recent);
            if (high === low) return null;
            return -100 * (high - c[c.length - 1]) / (high - low);
        },
        
        // 动量
        mom: (c, p = 10) => {
            if (c.length < p + 1) return null;
            return (c[c.length - 1] - c[c.length - 1 - p]) / c[c.length - 1 - p] * 100;
        },
        
        // Stochastic RSI
        stochRsi: (c, p = 14) => {
            if (c.length < p + 1) return null;
            let gains = [], losses = [];
            for (let i = 1; i < c.length; i++) {
                const d = c[i] - c[i - 1];
                gains.push(d > 0 ? d : 0);
                losses.push(d < 0 ? -d : 0);
            }
            const rsiVals = [];
            for (let i = p; i <= gains.length; i++) {
                const ag = gains.slice(i - p, i).reduce((a, b) => a + b) / p;
                const al = losses.slice(i - p, i).reduce((a, b) => a + b) / p;
                rsiVals.push(al === 0 ? 100 : 100 - (100 / (1 + ag / al)));
            }
            if (rsiVals.length < p) return null;
            const recent = rsiVals.slice(-p);
            const high = safeMax(recent), low = safeMin(recent);
            if (high === low) return { k: 50, d: 50 };
            const k = 3 * (recent[recent.length - 1] - low) / (high - low) + 50;
            return { k: isNaN(k) ? 50 : k, d: isNaN(k) ? 50 : k * 0.9 + 50 * 0.1 };
        },
        
        // CCI顺势指标
        cci: (c, p = 20) => {
            if (c.length < p) return null;
            const recent = c.slice(-p);
            const tp = recent.reduce((a, b) => a + b) / p;
            const sma = tp;
            const meanDev = recent.reduce((s, x) => s + Math.abs(x - sma), 0) / p;
            if (meanDev === 0) return 0;
            return (c[c.length - 1] - sma) / (0.015 * meanDev);
        },
        
        // ATR平均真实波幅
        atr: (c, p = 14) => {
            if (c.length < p + 1) return null;
            let trs = [];
            for (let i = 1; i < c.length; i++) {
                const tr = Math.max(
                    Math.abs(c[i] - c[i - 1]),
                    Math.abs(c[i] - c[i] * 0.01),
                    Math.abs(c[i - 1] - c[i] * 0.99)
                );
                trs.push(tr);
            }
            if (trs.length < p) return null;
            return trs.slice(-p).reduce((a, b) => a + b) / p;
        },
        
        // ADX平均趋向指数
        adx: (c, p = 14) => {
            if (c.length < p * 2) return null;
            const plusDM = [], minusDM = [], tr = [];
            for (let i = 1; i < c.length; i++) {
                const h = c[i] - c[i - 1], l = c[i - 1] - c[i];
                plusDM.push(h > l && h > 0 ? h : 0);
                minusDM.push(l > h && l > 0 ? l : 0);
                tr.push(Math.max(Math.abs(h), Math.abs(l), Math.abs(h - l) * 0.5));
            }
            if (plusDM.length < p * 2) return null;
            const adxVals = [];
            for (let i = p; i < plusDM.length; i += p) {
                const pDM = plusDM.slice(i - p, i).reduce((a, b) => a + b, 0);
                const mDM = minusDM.slice(i - p, i).reduce((a, b) => a + b, 0);
                const trVal = tr.slice(i - p, i).reduce((a, b) => a + b, 0);
                const plusDi = trVal > 0 ? 100 * pDM / trVal : 0;
                const minusDi = trVal > 0 ? 100 * mDM / trVal : 0;
                const dx = plusDi + minusDi > 0 ? 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi) : 0;
                adxVals.push(dx);
            }
            if (adxVals.length < 1) return null;
            return adxVals.reduce((a, b) => a + b) / adxVals.length;
        },
        
        // 近期低点
        recentLow: c => {
            if (c.length < 10) return null;
            const recent = c.slice(-10), min = safeMin(recent), idx = recent.indexOf(min);
            return { price: min, barsAgo: 10 - idx - 1 };
        },
        
        // 成交量趋势
        volTrend: v => {
            if (v.length < 12) return null;
            const recent = v.slice(-6), old = v.slice(-12, -6);
            const avgRecent = recent.reduce((a, b) => a + b) / 6;
            const avgOld = old.reduce((a, b) => a + b) / 6;
            return avgOld > 0 ? avgRecent / avgOld : null;
        },
        
        // 成交量均线
        volMa: (v, p = 20) => {
            if (v.length < p) return null;
            return v.slice(-p).reduce((a, b) => a + b) / p;
        },
        
        // ROC变动率
        roc: (c, p = 10) => {
            if (c.length < p + 1) return null;
            return (c[c.length - 1] - c[c.length - 1 - p]) / c[c.length - 1 - p] * 100;
        },
        
        // OBV计算
        calcObv: (c, v) => {
            if (c.length < 10 || v.length < 10) return { value: 0, rising: false };
            let obv = 0, recent = 0, old = 0;
            const len = Math.min(c.length, v.length);
            for (let i = 1; i < len; i++) {
                if (c[i] > c[i - 1]) obv += v[i];
                else if (c[i] < c[i - 1]) obv -= v[i];
            }
            for (let i = len - 5; i < len; i++) if (c[i] > c[i - 1]) recent += v[i]; else if (c[i] < c[i - 1]) recent -= v[i];
            for (let i = len - 10; i < len - 5; i++) if (c[i] > c[i - 1]) old += v[i]; else if (c[i] < c[i - 1]) old -= v[i];
            return { value: obv, rising: recent > old };
        },
        obv: (c, v) => TA.calcObv(c, v),

        // 统一背离检测
        divergence: (c, v) => {
            if (c.length < 20) return null;
            const rsiVals = [], len = c.length;
            for (let i = 14; i < len; i++) {
                let g = 0, l = 0;
                for (let j = i - 14; j < i; j++) {
                    const d = c[j + 1] - c[j];
                    if (d > 0) g += d; else l -= d;
                }
                rsiVals.push(l === 0 ? 100 : 100 - (100 / (1 + g / (l || 1))));
            }
            if (rsiVals.length < 10) return null;
            
            const recent = c.slice(-15), rsi = rsiVals.slice(-15);
            const ph = safeMax(recent), pl = safeMin(recent);
            const rh = safeMax(rsi), rl = safeMin(rsi);
            const curP = c[c.length - 1], curR = rsiVals[rsiVals.length - 1];
            
            if (curP >= ph * 0.98 && curR < rh * 0.95) return 'top';
            if (curP <= pl * 1.02 && curR > rl * 1.05) return 'bottom';
            return null;
        },
        
        // 多周期共振
        multiTimeframe: (c4, c1) => {
            if (!c4 || !c1 || c4.length < 20 || c1.length < 10) return { aligned: false, direction: null };
            const macd4 = TA.macd(c4), macd1 = TA.macd(c1);
            const rsi4 = TA.rsi(c4), rsi1 = TA.rsi(c1);
            const trend4h = macd4?.hist > 0 ? 'up' : 'down';
            const trend1h = macd1?.hist > 0 ? 'up' : 'down';
            let aligned = false, direction = null;
            if (trend4h === trend1h && trend4h === 'up' && rsi4 < 70 && rsi1 < 70) { aligned = true; direction = 'up'; }
            else if (trend4h === trend1h && trend4h === 'down' && rsi4 > 30 && rsi1 > 30) { aligned = true; direction = 'down'; }
            return { aligned, direction };
        },
        
        // 趋势加速
        trendAcceleration: (c) => {
            if (c.length < 30) return null;
            const ma5 = TA.ema(c, 5), ma20 = TA.ema(c, 20);
            if (!ma5 || !ma20) return null;
            const mom5 = TA.mom(c, 5), mom20 = TA.mom(c, 20);
            return {
                bullish: ma5 > ma20,
                accelerating: mom5 > (mom20 || 0) * 1.5 && (ma5 > ma20 || ma5 < ma20),
                strongTrend: (ma5 > ma20 || ma5 < ma20) && Math.abs(mom20) > 5
            };
        },
        
        // 波动率爆发
        volatilityBreakout: (c, v) => {
            if (c.length < 30 || v.length < 30) return null;
            const atrNow = TA.atr(c.slice(-20), 14);
            const atrOld = TA.atr(c.slice(-40, -20), 14);
            if (!atrNow || !atrOld) return null;
            const ratio = atrNow / atrOld;
            const volRatio = TA.volTrend(v);
            return { breakout: ratio > 1.5, atrRatio: ratio, volConfirmed: volRatio > 1.3 };
        },

        // OBV背离
        obvDivergence: (c, v) => {
            const d = TA.calcObv(c, v);
            if (c.length < 20) return null;
            const ph = safeMax(c.slice(-15)), pl = safeMin(c.slice(-15));
            const curP = c[c.length - 1];
            if (curP >= ph * 0.98 && !d.rising) return 'top';
            if (curP <= pl * 1.02 && d.rising) return 'bottom';
            return null;
        },

        // 均线金叉
        maCross: (c) => {
            if (c.length < 30) return null;
            const ma5 = TA.ema(c, 5), ma20 = TA.ema(c, 20);
            if (!ma5 || !ma20) return null;
            const ma5Prev = TA.ema(c.slice(-6, -1), 5), ma20Prev = TA.ema(c.slice(-6, -1), 20);
            return {
                bullish: ma5 > ma20, 
                goldenCross: ma5Prev <= ma20Prev && ma5 > ma20,
                strength: Math.abs((ma5 / ma20 - 1) * 100)
            };
        },

        // MACD加速
        macdAcceleration: (c) => {
            if (c.length < 30) return null;
            const macdVals = [];
            for (let i = 15; i < c.length; i++) {
                const m = TA.macd(c.slice(0, i + 1));
                if (m) macdVals.push(m.hist);
            }
            if (macdVals.length < 6) return null;
            const avgR = macdVals.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const avgO = macdVals.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
            return { accelerating: avgR > avgO * 1.5 && avgR > 0, histAvg: avgR };
        },

        // WR背离
        wrDivergence: (c) => {
            if (c.length < 20) return null;
            const wr = TA.wr(c);
            if (wr === null) return null;
            const ph = safeMax(c.slice(-15)), pl = safeMin(c.slice(-15));
            const curP = c[c.length - 1];
            if (curP >= ph * 0.98 && wr > -20) return 'top';
            if (curP <= pl * 1.02 && wr < -80) return 'bottom';
            return null;
        },

        // 市场情绪
        marketSentiment: (c, v, d) => {
            if (c.length < 20) return null;
            const rsi = TA.rsi(c), macd = TA.macd(c);
            if (rsi === null) return null;
            let bull = 0, bear = 0;
            if (rsi > 60) bull++; else if (rsi < 40) bear++;
            if (macd?.hist > 0) bull++; else if (macd?.hist < 0) bear++;
            if ((d.fr || 0) > 0.01) bull++; else if ((d.fr || 0) < -0.01) bear++;
            const taker = (typeof d.takerBuyRatio === 'string' ? parseFloat(d.takerBuyRatio) / 100 : d.takerBuyRatio) || 0.5;
            if (taker > 0.52) bull++; else if (taker < 0.48) bear++;
            const total = bull + bear;
            return { sentiment: total > 0 ? (bull / total) * 100 : 50, extreme: bull > 3 || bear > 3 };
        },

        // TD9序列
        tdSequential: (data) => {
            if (data.length < 10) return null;
            let buyCount = 0, sellCount = 0, buyPerfect = false, sellPerfect = false;
            const isBuyPhase = data[data.length - 1] < data[data.length - 5];
            const isSellPhase = data[data.length - 1] > data[data.length - 5];
            for (let i = data.length - 9; i < data.length; i++) {
                if (isBuyPhase && data[i] < data[i - 4]) buyCount++;
                if (isSellPhase && data[i] > data[i - 4]) sellCount++;
            }
            buyPerfect = buyCount === 9;
            sellPerfect = sellCount === 9;
            return { buyCount, sellCount, buyActive: buyCount > 0 && !buyPerfect, sellActive: sellCount > 0 && !sellPerfect, buyPerfect, sellPerfect };
        }
    };

    // ========== 公共计算函数 ==========
    // 统一的takerBuyRatio计算
    const calcTakerRatio = (t) => {
        const takerBuyVol = parseFloat(t.takerBuyQuoteAssetVolume) || 0;
        const totalVol = parseFloat(t.quoteVolume) || 1;
        const priceChg = parseFloat(t.priceChangePercent) || 0;
        if (takerBuyVol > 0) return Math.min(Math.max(takerBuyVol / (totalVol / 2), 0.3), 0.7);
        if (priceChg > 8) return 0.58;
        if (priceChg > 5) return 0.56;
        if (priceChg > 2) return 0.54;
        if (priceChg > 0) return 0.52;
        if (priceChg < -8) return 0.42;
        if (priceChg < -5) return 0.44;
        if (priceChg < -2) return 0.46;
        if (priceChg < 0) return 0.48;
        return 0.5;
    };
    
    const calcWhaleRatio = (takerRatio) => 0.3 + takerRatio * 1.7;

    // 指标箭头
    const getArrow = (val, type) => {
        const n = parseFloat(val) || 0;
        if (type === 'rsi') return n > 55 ? '🔴' : (n < 35 ? '🟢' : '');
        if (type === 'kdj') return n > 80 ? '🔴' : (n < 20 ? '🟢' : '');
        if (type === 'cci') return n > 100 ? '🔴' : (n < -100 ? '🟢' : '');
        return '';
    };

    // 标签样式
    const tagClass = s => s.includes('⚠️') ? 'tag-r' : (s.includes('🐋') || s.includes('🦈') ? 'tag-whale' : (s.includes('🔮') ? 'tag-pre' : ''));

    // 评分样式映射
    const LEVEL_CLASS = { '🚀暴涨预警': 's-h', '⚡积累中': 's-w', '👀观察中': 's-c', '🔮预涨蓄力': 's-pre' };

    // 卡片配置
    const CARD_CONFIG = {
        rebound: { border: '#00e676', label: '🔼反弹', scoreClass: 's-h' },
        crash: { border: '#ef5350', label: '', scoreClass: 's-crash' },
        hotTrend: { border: '#ff9800', label: '🔥HOT', scoreClass: 's-hot' },
        whale: { border: '#00bcd4', label: '', scoreClass: 's-whale' },
        preBurst: { border: '#7c4dff', label: '🔮蓄力', scoreClass: 's-pre' }
    };

    // ========== 三维共振评分系统 (预涨前瞻版) ==========
    function calcScore3D(d) {
        let s = 0, sig = [], level = '中性', isBottomRebound = false, isWatch = false, isCrash = false, crashSignals = 0, isPreBurst = false;
        const fromLow = d.fromLow || 0;
        const core = { tech: 0, fund: 0, whale: 0 };
        const taker = (typeof d.takerBuyRatio === 'string' ? parseFloat(d.takerBuyRatio) / 100 : d.takerBuyRatio) || 0.5;
        const whale = d.whaleLongShortRatio || 1;
        const maxChg = Math.max(d.chg4h, d.chg1h, d.chg24h / 4);
        const bbWidth = d.bb?.w || 999;

        // 1. 暴跌检测
        const crashChg = d.chg4h <= -10 ? d.chg4h : (d.chg24h <= -18 ? d.chg24h : 0);
        if (crashChg <= -10) crashSignals += 5;
        else if (d.chg4h <= -6 || d.chg24h <= -12) crashSignals += 3;
        
        if (crashSignals >= 3) {
            if (d.rsi > 70) crashSignals += 2;
            if (d.kdj?.j > 85) crashSignals += 2;
            if (d.macd?.hist < 0) crashSignals++;
            if (crashSignals >= 2 && d.mom < -5) crashSignals++;
            if (d.fr < -0.01) crashSignals++;
            if (crashSignals >= 4 && d.vr < 0.8) crashSignals--;
            if (crashSignals >= 5) {
                sig.push(`💥暴跌${Math.abs(crashChg).toFixed(1)}%`);
                if (d.rsi > 70) sig.push('⚠️RSI高位');
                if (d.kdj?.j > 85) sig.push('⚠️KDJ超买');
                core.tech = Math.min(Math.floor(crashSignals / 2), 4);
                if (taker < 0.5) core.whale = Math.floor((0.5 - taker) * 10);
                if (d.fr < 0) core.fund = 1;
                const crashResonance = core.tech * 2 + core.fund + core.whale;
                return { s: 70 + crashSignals * 2, sig: sig.slice(0, 5), level: '💎暴跌预警', isBottomRebound, isWatch, isCrash: true, crashSignals, core, resonanceScore: crashResonance, isPreBurst };
            }
        }

        // 2. 底部反弹
        if (fromLow > 2 && fromLow < 25) {
            let reboundScore = 0;
            if (d.rsi < 35) { reboundScore += 3; sig.push('📊RSI超卖'); }
            else if (d.rsi < 40) reboundScore++;
            if (d.kdj?.j < 20) reboundScore += 2;
            else if (d.kdj?.j < 30) reboundScore++;
            if ((d.bb?.pos || 50) < 15) reboundScore += 2;
            else if ((d.bb?.pos || 50) < 25) reboundScore++;
            if ((d.wr !== null && d.wr < -90) || (d.cci < -150)) reboundScore += 2;
            else if ((d.wr !== null && d.wr < -80) || (d.cci < -100)) reboundScore++;
            if (d.macd?.hist > 0) { reboundScore += 2; sig.push('💹MACD转多'); }
            if (d.vr >= 1.3) reboundScore++;
            if (d.chg1h > 0) reboundScore++;
            if (d.divergence === 'bottom') { reboundScore += 3; sig.push('📈底背离确认'); }
            if (d.mtf?.aligned && d.mtf?.direction === 'up') reboundScore += 2;
            if (d.wrDiv === 'bottom' || d.obvDiv === 'bottom') reboundScore += 2;
            
            core.tech = Math.min(Math.floor(reboundScore / 3), 4);
            if (taker > 0.5) core.whale = Math.floor((taker - 0.5) * 10);
            if (d.fr > 0) core.fund = 1;
            const reboundResonance = core.tech * 2 + core.fund + core.whale;
            
            if (reboundScore >= 5) return { s: 20 + reboundScore * 2, sig: sig.slice(0, 6), level: '🔼底部反弹', isBottomRebound: true, isWatch, isCrash, crashSignals, core, resonanceScore: reboundResonance, isPreBurst };
        }

        // 3. 预涨蓄力检测
        let preScore = 0;
        const preSigs = [];
        const isQuiet = Math.abs(d.chg4h) < 3 && Math.abs(d.chg1h) < 2 && Math.abs(d.chg24h) < 8;
        
        if (isQuiet && bbWidth < 3) {
            if (bbWidth < 1.5) { preScore += 5; preSigs.push('🔮布林极收口'); }
            else if (bbWidth < 2) { preScore += 3; preSigs.push('📊布林收口'); }
            else { preScore += 2; }
            
            if (d.macd?.hist > 0 && d.macd?.hist < 0.3 && d.macd?.dif > -0.1) { preScore += 4; preSigs.push('💹MACD初现'); }
            else if (d.macd?.hist > 0) { preScore += 2; }
            
            if (d.vr >= 1.5) { preScore += 3; preSigs.push(`📈量能${d.vr.toFixed(1)}x萌动`); }
            else if (d.vr >= 1.3) { preScore += 2; }
            
            if (taker >= 0.58) { preScore += 5; preSigs.push(`🟢Taker${(taker*100).toFixed(0)}%吸筹`); }
            else if (taker >= 0.55) { preScore += 3; preSigs.push(`🟢Taker${(taker*100).toFixed(0)}%暗进`); }
            else if (taker >= 0.52) { preScore += 1; }
            
            if (d.ma7 && d.ma25 && d.ma99 && d.ma7 > d.ma25 && d.ma25 > d.ma99) { preScore += 2; preSigs.push('📈均线蓄势'); }
            if (d.mtf?.aligned && d.mtf.direction === 'up') { preScore += 3; preSigs.push('🔄多周期同向'); }
            if (d.divergence === 'bottom') { preScore += 3; preSigs.push('📊底背离'); }
            if (d.obvDiv === 'bottom') { preScore += 2; preSigs.push('📊OBV背离'); }
            if ((d.fr || 0) < -0.003) { preScore += 3; preSigs.push('💚费率利多'); }
            else if ((d.fr || 0) < -0.001) { preScore += 1; }
        }
        
        if (preScore >= 10 && isQuiet && preSigs.length >= 2) {
            core.tech = Math.min(Math.floor(preScore / 3), 4);
            if (taker > 0.52) core.whale = Math.floor((taker - 0.5) * 8);
            if ((d.fr || 0) < -0.001) core.fund = 1;
            const preResonance = core.tech * 2 + core.fund + core.whale;
            return {
                s: 30 + preScore * 3, sig: preSigs.slice(0, 6), level: '🔮预涨蓄力',
                isBottomRebound, isWatch, isCrash, crashSignals, core, resonanceScore: preResonance,
                isPreBurst: true, preScore
            };
        }

        // 4. 暴涨信号
        if (bbWidth < 2) { core.tech += 3; s += 25; sig.push('🔮布林极收口'); }
        else if (bbWidth < 3) { core.tech += 2; s += 18; sig.push('📊布林收口'); }
        else if (bbWidth < 5) { core.tech++; s += 10; }
        
        if (d.macd?.hist > 0.5) { core.tech += 2; s += 12; sig.push('💹MACD金叉'); }
        else if (d.macd?.hist > 0.1 && d.macd?.dif < 0.2) { core.tech += 2; s += 15; sig.push('💹MACD零轴金叉'); }
        else if (d.macd?.hist > 0.2) { core.tech++; s += 8; }
        
        if (d.vr >= 1.3 && d.vr < 2.0) { core.tech += 2; s += 18; sig.push(`📈量能${d.vr.toFixed(1)}x萌动`); }
        else if (d.vr >= 2.0 && d.vr < 4.0) { core.tech++; s += 10; sig.push(`🔥量能${d.vr.toFixed(1)}x`); }
        else if (d.vr >= 4.0) { s += 5; sig.push(`🔥量能${d.vr.toFixed(1)}x`); }
        
        if (d.rsi >= 42 && d.rsi <= 58) { core.tech++; s += 8; }
        if (d.mom > 4) { core.tech++; s += 6; }
        
        const liqRisk = Math.abs(d.fr || 0) * Math.abs(d.chg4h || 0);
        if ((d.fr || 0) < -0.001 && (d.chg4h || 0) > 0) {
            core.fund += 2; s += 10; sig.push(`💎空杀${((d.fr || 0) * 100).toFixed(2)}%`);
        } else if ((d.fr || 0) < -0.003) {
            core.fund += 1; s += 5;
        }
        if ((d.fr || 0) > 0.001 && (d.chg4h || 0) < 0) {
            s -= 8; sig.push(`💎多杀${((d.fr || 0) * 100).toFixed(2)}%`);
        } else if ((d.fr || 0) > 0.003) {
            s -= 5;
        }
        if (liqRisk > 3) {
            core.tech++; s += 6; sig.push(`⚡清算${liqRisk.toFixed(1)}`);
        }
        
        if (taker >= 0.58) { 
            core.fund += 2; core.whale += 2; s += 27; 
            sig.push(`🟢Taker${(taker * 100).toFixed(0)}%`);
        } else if (taker >= 0.55) { 
            core.fund++; core.whale++; s += 14; 
        } else if (taker >= 0.52) {
            core.whale++; s += 6;
        }
        if (d.fr < 0 && d.fr >= -0.015) { core.fund++; s += 5; }
        
        if (maxChg >= 10) { s += 3; sig.push(`📈${maxChg.toFixed(1)}%`); }
        else if (maxChg >= 6) s += 2;
        else if (maxChg >= 3) s += 2;
        if (d.ma7 && d.ma25 && d.ma99 && d.ma7 > d.ma25 && d.ma25 > d.ma99) { s += 6; sig.push('📈均线多头'); }
        
        if (maxChg >= 15) { s -= 15; sig.push('⚠️高位追高'); }
        else if (maxChg >= 10) { s -= 8; }
        else if (maxChg >= 7) { s -= 3; }
        
        if (d.divergence === 'top') { s -= 12; sig.push('⚠️顶背离'); }
        else if (d.divergence === 'bottom') { s += 10; sig.push('📊底背离'); }
        if (d.mtf?.aligned && d.mtf.direction === 'up') { core.tech += 2; s += 18; sig.push('🔄多周期'); }
        else if (d.mtf?.aligned && d.mtf.direction === 'down') { s -= 10; }
        if (d.trendAccel?.strongTrend && d.trendAccel.bullish) { core.tech++; s += 12; sig.push('💥主升浪'); }
        if (d.volBreakout?.breakout && d.volBreakout.volConfirmed) { core.tech += 2; s += 15; sig.push(`📊波率${d.volBreakout.atrRatio.toFixed(1)}x`); }
        else if (d.volBreakout?.breakout) { s += 8; }
        if (d.maCross?.goldenCross) { core.tech += 2; s += 18; sig.push('🌟均线金叉'); }
        if (d.macdAccel?.accelerating) { core.tech++; s += 12; }
        if (d.obvDiv === 'top') s -= 10;
        else if (d.obv?.rising) s += 5;
        if (d.sentiment) {
            if (d.sentiment.sentiment > 75) { core.tech++; s += 10; sig.push('😊情绪高涨'); }
            else if (d.sentiment.sentiment < 25) { s -= 10; }
        }
        
        if (maxChg > 8 && d.vr < 1.3) { s -= 12; sig.push('⚠️虚涨'); }
        if (maxChg > 6 && d.vr >= 1.8) s += 6;
        if (d.fr > 0.02) { s -= 10; sig.push('⚠️高费率'); }
        if (d.rsi > 68) s -= 6;
        if (whale < 0.75) { s -= 12; sig.push('🦈大户偏空'); }
        
        s = Math.min(Math.max(s, 0), 130);
        
        const resonanceScore = core.tech * 2 + core.fund + core.whale;
        if (resonanceScore >= 5 && s >= 50) level = '🚀暴涨预警';
        else if (resonanceScore >= 3 && s >= 40) level = '⚡积累中';
        else if (s >= 30) { level = '👀观察中'; isWatch = true; }
        
        return { s, sig: sig.slice(0, 8), level, isBottomRebound, isWatch, isCrash, crashSignals, core, resonanceScore, isPreBurst };
    }

    // ========== 导出到全局 ==========
    const BinanceShared = {
        // 常量
        API,
        CORS_PROXIES,
        
        // 工具函数
        $, fmt, fp, fv, fc, err, setProgress, safeMin, safeMax,
        
        // API
        apiFetch,
        
        // TA库
        TA,
        
        // 计算函数
        calcTakerRatio,
        calcWhaleRatio,
        getArrow,
        tagClass,
        LEVEL_CLASS,
        CARD_CONFIG,
        
        // 评分
        calcScore3D
    };

    // 导出到全局
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BinanceShared;
    }
    global.BinanceShared = BinanceShared;

})(typeof window !== 'undefined' ? window : this);
