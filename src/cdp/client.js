import WebSocket from 'ws';
import { getJson } from '../utils/network.js';
import { logInteraction } from '../utils/logger.js';
import { loadWorkspaces } from '../discord/commands/workspace.js';

const PORTS = [9222, 9000, 9001, 9002, 9003];
const CDP_CALL_TIMEOUT = 30000;

const connections = new Map();

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
                return { port, url: target.webSocketDebuggerUrl };
            }
        } catch (e) {
            // Port check failed
        }
    }
    throw new Error("CDP not found.");
}

export async function connectCDP(url, channelId) {
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
        logInteraction('CDP', 'WebSocket disconnected.');
        if (connections.get(channelId)?.ws === ws) {
            connections.delete(channelId);
        }
        if (connections.get('default')?.ws === ws) {
            connections.delete('default');
        }
    });

    await call("Runtime.enable", {});
    await call("Runtime.disable", {});
    await call("Runtime.enable", {});
    await new Promise(r => setTimeout(r, 1000));
    console.log(`[CDP] Initialized with ${contexts.length} contexts.`);
    logInteraction('CDP', `Connected to target: ${url}`);
    return { ws, call, contexts, url };
}

export async function ensureCDP(channelId = 'default') {
    const connKey = channelId;
    if (connections.has(connKey)) {
        const conn = connections.get(connKey);
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) return conn;
    }

    let targetUrl = null;
    if (channelId && channelId !== 'default') {
        const workspaces = loadWorkspaces();
        if (workspaces[channelId]) {
            targetUrl = workspaces[channelId];
        }
    }

    try {
        if (!targetUrl) {
            const { url } = await discoverCDP();
            targetUrl = url;
        }
        const conn = await connectCDP(targetUrl, channelId);
        connections.set(channelId, conn);
        return conn;
    } catch (e) {
        if (process.env.MOCK_MODE === 'true') {
            const mockConn = createMockCDP();
            connections.set(channelId, mockConn);
            return mockConn;
        }
        return null;
    }
}

export function getCdpConnection(channelId = 'default') {
    return connections.get(channelId);
}

export function closeCdpConnection(channelId) {
    if (connections.has(channelId)) {
        const conn = connections.get(channelId);
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.close();
        }
        connections.delete(channelId);
        logInteraction('CDP', `Connection closed manually for channel: ${channelId}`);
    }
}
