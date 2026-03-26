const http = require('http');
const WebSocket = require('ws');

async function getJson(url) {
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

async function testDiscovery() {
    const PORTS = [9222, 9000, 9001, 9002, 9003];
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

    console.log(`Found ${allTargets.length} total targets.`);

    // Test Priority Logic (Sync with discord_bot.js)
    let target = allTargets.find(t =>
        (t.title.toLowerCase().includes('workspace') || t.url.toLowerCase().includes('workspace')) &&
        (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade')) &&
        !t.title.includes('Launchpad')
    );

    if (target) {
        console.log(`PASS: Default target found with priority (workspace): ${target.title}`);
    } else {
        console.log(`WARN: No "workspace" target found. Falling back to non-workspace target.`);
        target = allTargets.find(t =>
            !t.title.includes('Launchpad') &&
            (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade'))
        );
        if (target) console.log(`Selected fallback: ${target.title}`);
    }

    console.log("\nAll Available Windows:");
    allTargets.forEach((t, i) => {
        const isWorkspace = t.title.toLowerCase().includes('workspace') || t.url.toLowerCase().includes('workspace');
        console.log(`${i + 1}. ${t.title} ${isWorkspace ? '[WORKSPACE]' : ''} (Port:${t.port})`);
    });
}

testDiscovery();
