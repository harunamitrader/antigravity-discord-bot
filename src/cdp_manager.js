// --- CDP接続管理 ---
import WebSocket from 'ws';
import http from 'http';
import { PORTS, CDP_CALL_TIMEOUT } from './config.js';
import { state } from './state.js';
import { logInteraction } from './logging.js';

export function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

export async function discoverCDP() {
    const allTargets = [];

    // 低優先度判定ヘルパー（除外ではなく優先度を下げる）
    const isLowPriorityTarget = (t) => {
        const url = String(t.url || '').toLowerCase();
        const title = String(t.title || '').toLowerCase();
        if (url.includes('workbench-jetski-agent.html')) return true;
        if (title.includes('drifting-apogee') || title.includes('perihelion-oort')) return true;
        return false;
    };

    // DOM要素数を取得するプローブ（一時的にWebSocket接続→取得→切断）
    const probeElementCount = async (target) => {
        try {
            const ws = new WebSocket(target.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('probe timeout')), 1000);
            });
            let msgId = 1;
            const call = (method, params) => new Promise((resolve, reject) => {
                const id = msgId++;
                const timeoutId = setTimeout(() => reject(new Error('call timeout')), 1000);
                const handler = (msg) => {
                    try {
                        const d = JSON.parse(msg);
                        if (d.id === id) {
                            ws.off('message', handler);
                            clearTimeout(timeoutId);
                            if (d.error) reject(d.error); else resolve(d.result);
                        }
                    } catch (e) { /* パースエラーは無視 */ }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
            const res = await call('Runtime.evaluate', {
                expression: 'document.querySelectorAll("*").length',
                returnByValue: true
            });
            ws.close();
            return Number(res?.result?.value) || 0;
        } catch (e) {
            return 0;
        }
    };

    // 候補リストからDOM要素数が最も多いターゲットを選択する
    const pickBestTarget = async (candidates) => {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        console.log(`[CDP] Multiple candidates (${candidates.length}). Probing element counts...`);
        const probed = [];
        for (const t of candidates) {
            const count = await probeElementCount(t);
            console.log(`[CDP]   "${t.title}" => ${count} elements`);
            probed.push({ target: t, elementCount: count });
        }
        probed.sort((a, b) => b.elementCount - a.elementCount);
        return probed[0].target;
    };

    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);
            console.log(`[CDP] Checking port ${port}, found ${list.length} targets.`);
            for (const t of list) {
                if (t.type === 'page' && t.webSocketDebuggerUrl) {
                    allTargets.push({ ...t, port });
                }
            }
        } catch (e) {
            console.log(`[CDP] Port ${port} check failed: ${e.message}`);
        }
    }

    if (allTargets.length === 0) throw new Error("CDP not found.");

    // 手動選択されたターゲットがある場合はそれを使用
    if (state.explicitTargetUrl) {
        const selected = allTargets.find(t => t.webSocketDebuggerUrl === state.explicitTargetUrl);
        if (selected) {
            console.log(`[CDP] Using explicitly selected target: ${selected.title}`);
            return { port: selected.port, url: selected.webSocketDebuggerUrl };
        }
    }

    // 1. HIGHEST: ワークスペースが開かれているメインのworkbenchウィンドウ
    let target = await pickBestTarget(allTargets.filter(t =>
        t.type === 'page' &&
        t.url.includes('workbench.html') &&
        (t.url.includes('?workspace=') || t.url.includes('&workspace=')) &&
        !isLowPriorityTarget(t)
    ));

    // 2. workbench.html だがワークスペースパラメータがないもの
    if (!target) {
        target = await pickBestTarget(allTargets.filter(t =>
            t.type === 'page' &&
            t.url.includes('workbench.html') &&
            !isLowPriorityTarget(t)
        ));
    }

    // 3. 低優先度ターゲット
    if (!target) {
        target = await pickBestTarget(allTargets.filter(t =>
            t.type === 'page' &&
            t.url.includes('workbench.html') &&
            isLowPriorityTarget(t)
        ));
    }

    // 4. Last fallback
    if (!target) {
        target = await pickBestTarget(allTargets.filter(t =>
            t.type === 'page' &&
            (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade'))
        ));
    }

    if (target) {
        const lowPri = isLowPriorityTarget(target);
        console.log(`\n========================================`);
        console.log(`[CDP] === CONNECTED TO TARGET ===`);
        console.log(`[CDP] Title: ${target.title}`);
        console.log(`[CDP] URL: ${target.url}`);
        if (lowPri) console.log(`[CDP] Note: This is a low-priority target.`);
        console.log(`========================================\n`);
        return { port: target.port, url: target.webSocketDebuggerUrl };
    }
    throw new Error("Suitable CDP target not found.");
}

export async function listAllCDPTargets() {
    const allTargets = [];

    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);
            for (const t of list) {
                if (t.type === 'page' && t.webSocketDebuggerUrl) {
                    allTargets.push({ ...t, port });
                }
            }
        } catch (e) { }
    }
    return allTargets;
}

export async function connectCDP(url, options = {}) {
    const silent = options.silent || false;
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });
    const contexts = [];
    let idCounter = 1;
    const pending = new Map();

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.id !== undefined && pending.has(data.id)) {
                const { resolve, reject, timeoutId } = pending.get(data.id);
                clearTimeout(timeoutId);
                pending.delete(data.id);
                if (data.error) reject(data.error); else resolve(data.result);
            }
            if (data.method === 'Runtime.executionContextCreated') contexts.push(data.params.context);
            if (data.method === 'Runtime.executionContextDestroyed') {
                const idx = contexts.findIndex(c => c.id === data.params.executionContextId);
                if (idx !== -1) contexts.splice(idx, 1);
            }
        } catch (e) { }
    });

    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;
        const timeoutId = setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); reject(new Error("Timeout")); }
        }, CDP_CALL_TIMEOUT);
        pending.set(id, { resolve, reject, timeoutId });
        ws.send(JSON.stringify({ id, method, params }));
    });

    ws.on('close', () => {
        if (!silent) logInteraction('CDP', 'WebSocket disconnected.');
        if (state.cdpConnection && state.cdpConnection.ws === ws) {
            state.cdpConnection = null;
        }
    });

    await call("Runtime.enable", {});
    if (!silent) console.log(`[CDP] Initialized with ${contexts.length} contexts.`);
    if (!silent) logInteraction('CDP', `Connected to target: ${url}`);
    return { ws, call, contexts };
}

export async function ensureCDP() {
    if (state.cdpConnection && state.cdpConnection.ws.readyState === WebSocket.OPEN) return state.cdpConnection;
    try {
        const { url } = await discoverCDP();
        state.cdpConnection = await connectCDP(url);
        return state.cdpConnection;
    } catch (e) { return null; }
}
