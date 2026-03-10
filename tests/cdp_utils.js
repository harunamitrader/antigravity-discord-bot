import WebSocket from 'ws';
import http from 'http';

const PORTS = [9222];
const CDP_CALL_TIMEOUT = 30000;

let cdpConnection = null;

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
    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);
            console.log(`[CDP] Checking port ${port}, found ${list.length} targets.`);

            let target = list.find(t =>
                t.type === 'page' &&
                t.webSocketDebuggerUrl &&
                !t.title.includes('Launchpad') &&
                !t.url.includes('workbench-jetski-agent') &&
                (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade'))
            );

            if (!target) {
                target = list.find(t =>
                    t.webSocketDebuggerUrl &&
                    (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade')) &&
                    !t.title.includes('Launchpad')
                );
            }

            if (!target) {
                target = list.find(t =>
                    t.webSocketDebuggerUrl &&
                    (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade') || t.title.includes('Launchpad'))
                );
            }

            if (target && target.webSocketDebuggerUrl) {
                console.log(`[CDP] Connected to target: ${target.title} (${target.url})`);
                return { port, url: target.webSocketDebuggerUrl };
            }
        } catch (e) {
            console.log(`[CDP] Port ${port} check failed: ${e.message}`);
        }
    }
    throw new Error("CDP not found.");
}

export async function connectCDP(url) {
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
        console.log('[CDP] WebSocket disconnected.');
        if (cdpConnection && cdpConnection.ws === ws) {
            cdpConnection = null;
        }
    });

    await call("Runtime.enable", {});
    await call("Runtime.disable", {});
    await call("Runtime.enable", {});
    await new Promise(r => setTimeout(r, 1000));
    console.log(`[CDP] Initialized with ${contexts.length} contexts.`);
    return { ws, call, contexts };
}

export async function ensureCDP() {
    if (cdpConnection && cdpConnection.ws.readyState === WebSocket.OPEN) return cdpConnection;
    try {
        const { url } = await discoverCDP();
        cdpConnection = await connectCDP(url);
        return cdpConnection;
    } catch (e) { return null; }
}
