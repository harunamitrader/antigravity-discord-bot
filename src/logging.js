// --- ロギング関数群 ---
import fs from 'fs';
import { state } from './state.js';
import { LOG_FILE, DISCORD_ACTIVITY_LOG_ENABLED, DISCORD_ACTIVITY_LOG_TYPES } from './config.js';

const COLORS = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

export function setTitle(status) {
    process.stdout.write(String.fromCharCode(27) + "]0;Antigravity Bot: " + status + String.fromCharCode(7));
}

export function shouldRelayLogToDiscord(type) {
    return DISCORD_ACTIVITY_LOG_ENABLED && DISCORD_ACTIVITY_LOG_TYPES.has(type);
}

export function formatLogForDiscord(type, content) {
    const icons = {
        INJECT: '[IN]',
        NEWCHAT: '[NC]',
        APPROVAL: '[AP]',
        ACTION: '[AC]',
        ERROR: '[ER]',
        STOP: '[ST]',
        SUCCESS: '[OK]',
        UPLOAD: '[UP]',
        UPLOAD_ERROR: '[UE]',
        generating: '[GN]'
    };

    const icon = icons[type] || '[--]';
    const normalized = String(content || '').replace(/\s+/g, ' ').trim();
    const max = 1700;
    const body = normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
    return `${icon} [${type}] ${body}`;
}

export async function relayLogToDiscord(type, content) {
    if (!state.lastActiveChannel) return;
    if (!shouldRelayLogToDiscord(type)) return;

    const message = formatLogForDiscord(type, content);
    const now = Date.now();
    const key = `${type}:${message}`;
    if (state.lastDiscordActivity.key === key && (now - state.lastDiscordActivity.at) < 3000) return;
    state.lastDiscordActivity = { key, at: now };

    try {
        await state.lastActiveChannel.send({ content: message });
    } catch (e) {
        console.error('[DISCORD_ACTIVITY_LOG_ERROR]', e.message);
    }
}

export function logInteraction(type, content) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${content}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);

    let color = COLORS.reset;
    let icon = '';

    switch (type) {
        case 'INJECT':
        case 'SUCCESS':
            color = COLORS.green;
            icon = '[OK] ';
            break;
        case 'ERROR':
            color = COLORS.red;
            icon = '[ERR] ';
            break;
        case 'generating':
            color = COLORS.yellow;
            icon = '[GEN] ';
            break;
        case 'CDP':
            color = COLORS.cyan;
            icon = '[CDP] ';
            break;
        default:
            color = COLORS.reset;
    }

    console.log(`${color}[${type}] ${icon}${content}${COLORS.reset}`);

    if (type === 'CDP' && content.includes('Connected')) setTitle('Connected');
    if (type === 'CDP' && content.includes('disconnected')) setTitle('Disconnected');
    if (type === 'generating') setTitle('Generating...');
    if (type === 'SUCCESS' || (type === 'INJECT' && !content.includes('failed'))) setTitle('Connected');
    void relayLogToDiscord(type, content);
}
