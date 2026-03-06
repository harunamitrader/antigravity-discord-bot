// --- Discord返信ヘルパー ---
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { state } from './state.js';
import { RAW_DUMP_MODE, RAW_DUMP_FILE, ALLOWED_DISCORD_USER, ALLOWED_DISCORD_USER_IS_ID, TEST_CHANNEL_ID } from './config.js';
import { logInteraction } from './logging.js';
import {
    splitForEmbed, clipText, sanitizeAssistantMarkdown, extractNarrativeBody,
    meaningfulBodyScore, isLowConfidenceResponse, detectPromptFromRawText
} from './text_processing.js';

export function isAuthorizedDiscordUser(user) {
    if (ALLOWED_DISCORD_USER_IS_ID) {
        return user.id === ALLOWED_DISCORD_USER;
    }
    return (user.username || '').toLowerCase() === ALLOWED_DISCORD_USER.toLowerCase();
}

export function buildRawResponseEnvelope(response, promptText = '', renderedContent = '') {
    const now = new Date().toISOString();
    return {
        capturedAt: now,
        prompt: String(promptText || ''),
        selector: String(response?.selector || ''),
        contextId: Number(response?.contextId || 0),
        messageRoleCount: Number(response?.messageRoleCount || 0),
        text: clipText(response?.text || ''),
        markdown: clipText(response?.markdown || ''),
        renderedContent: clipText(renderedContent || ''),
        images: Array.isArray(response?.images) ? response.images : [],
        domDebug: response?.domDebug || null
    };
}

export function writeDomDebugHtmlFiles(payload, outPath) {
    const htmlFiles = [];
    const domDebug = payload?.domDebug && typeof payload.domDebug === 'object'
        ? payload.domDebug
        : null;
    if (!domDebug) return htmlFiles;

    const outDir = path.dirname(outPath);
    const baseName = path.basename(outPath, path.extname(outPath));
    const targets = [
        { key: 'nodeInnerHTML', suffix: 'node_inner.html' },
        { key: 'nodeOuterHTML', suffix: 'node_outer.html' }
    ];

    for (const target of targets) {
        const value = String(domDebug[target.key] || '');
        if (!value.trim()) continue;

        try {
            const htmlPath = path.join(outDir, `${baseName}_${target.suffix}`);
            fs.writeFileSync(htmlPath, value, 'utf8');
            const relPath = path.relative(process.cwd(), htmlPath).replace(/\\/g, '/');
            domDebug[`${target.key}HtmlFile`] = relPath || path.basename(htmlPath);
            domDebug[target.key] = `[saved to ${domDebug[`${target.key}HtmlFile`]}]`;
            htmlFiles.push(htmlPath);
        } catch (e) {
            logInteraction('ERROR', `[RAW_DUMP] ${target.key} html write failed: ${e?.message || String(e)}`);
        }
    }

    return htmlFiles;
}

export function writeRawDumpFile(payload) {
    try {
        const outDir = path.join(process.cwd(), 'debug');
        fs.mkdirSync(outDir, { recursive: true });
        const fileName = RAW_DUMP_FILE
            ? path.basename(RAW_DUMP_FILE)
            : `raw_response_${Date.now()}.json`;
        const outPath = RAW_DUMP_FILE
            ? (path.isAbsolute(RAW_DUMP_FILE) ? RAW_DUMP_FILE : path.join(process.cwd(), RAW_DUMP_FILE))
            : path.join(outDir, fileName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const htmlFiles = writeDomDebugHtmlFiles(payload, outPath);
        fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
        return { outPath, htmlFiles };
    } catch (e) {
        logInteraction('ERROR', `[RAW_DUMP] write failed: ${e?.message || String(e)}`);
        return { outPath: '', htmlFiles: [] };
    }
}

export async function emitRawDump(target, response, promptText = '', renderedContent = '') {
    if (!RAW_DUMP_MODE) return;

    const payload = buildRawResponseEnvelope(response, promptText, renderedContent);
    const { outPath, htmlFiles } = writeRawDumpFile(payload);
    if (!outPath) return;

    const preview = clipText(JSON.stringify({
        prompt: payload.prompt,
        selector: payload.selector,
        messageRoleCount: payload.messageRoleCount,
        domDebug: payload.domDebug
    }, null, 2), 1300);

    logInteraction('ACTION', `[RAW_DUMP] Saved: ${outPath}${htmlFiles.length > 0 ? ` (+${htmlFiles.length} html)` : ''}\n${preview}`);
    logInteraction('ACTION', '[RAW_DUMP] Discord upload removed; kept local files only.');
}

export async function safeReplyTarget(target, payload, options = {}) {
    const preferReply = options.preferReply !== false;
    const attempts = [];
    const errors = [];

    if (preferReply && typeof target?.reply === 'function') {
        attempts.push({ name: 'target.reply', fn: () => target.reply(payload) });
    }
    if (typeof target?.followUp === 'function') {
        attempts.push({ name: 'target.followUp', fn: () => target.followUp(payload) });
    }
    if (typeof target?.channel?.send === 'function') {
        attempts.push({ name: 'target.channel.send', fn: () => target.channel.send(payload) });
    }
    if (typeof state.lastActiveChannel?.send === 'function') {
        attempts.push({ name: 'lastActiveChannel.send', fn: () => state.lastActiveChannel.send(payload) });
    }

    for (const attempt of attempts) {
        try {
            const result = await attempt.fn();
            return { ok: true, result, method: attempt.name };
        } catch (e) {
            errors.push(`${attempt.name}: ${e?.message || String(e)}`);
        }
    }

    throw new Error(`Reply failed via all methods. ${errors.join(' | ') || 'no method available'}`);
}

export async function sendResponseEmbeds(originalMessage, response, promptText = '') {
    if (!response?.text) return false;

    const content = response.text;
    if (!content) return false;

    logInteraction('ACTION', `[SEND_PREVIEW] ${content.slice(0, 200)}...`);

    try {
        const chunks = splitForEmbed(content, 1900);
        for (let i = 0; i < chunks.length; i++) {
            await safeReplyTarget(
                originalMessage,
                { content: chunks[i] },
                { preferReply: i === 0 }
            );
        }
        logInteraction('ACTION', `[DISCORD_RESPONSE] Sent ${chunks.length} message chunks to Discord.`);
    } catch (e) {
        logInteraction('ERROR', `[DISCORD_RESPONSE] Failed to send response: ${e?.message || String(e)}`);
        return false;
    }

    return true;
}

export function createInteractionReplyBridge(interaction, promptText = '') {
    return {
        content: promptText,
        author: { id: interaction.user?.id || '' },
        followUp: async (payload) => interaction.followUp(payload),
        channel: {
            send: async (payload) => interaction.followUp(payload)
        },
        reply: async (payload) => {
            if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
            return interaction.reply(payload);
        },
        editReply: async (payload) => interaction.editReply(payload)
    };
}

export function canSendChannel(channel) {
    return Boolean(channel && typeof channel.send === 'function');
}

export function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFile(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

export async function resolveStartupTestDestination(client) {
    if (canSendChannel(state.lastActiveChannel)) {
        const ch = state.lastActiveChannel;
        return { channel: ch, label: `lastActiveChannel(${ch?.id || 'unknown'})` };
    }

    if (TEST_CHANNEL_ID) {
        try {
            const ch = await client.channels.fetch(TEST_CHANNEL_ID);
            if (canSendChannel(ch)) return { channel: ch, label: `DISCORD_TEST_CHANNEL_ID(${TEST_CHANNEL_ID})` };
            logInteraction('ERROR', `[TEST] DISCORD_TEST_CHANNEL_ID is not sendable: ${TEST_CHANNEL_ID}`);
        } catch (e) {
            logInteraction('ERROR', `[TEST] Failed to fetch DISCORD_TEST_CHANNEL_ID ${TEST_CHANNEL_ID}: ${e?.message || String(e)}`);
        }
    }

    if (ALLOWED_DISCORD_USER_IS_ID) {
        try {
            const user = await client.users.fetch(ALLOWED_DISCORD_USER);
            const dm = await user.createDM();
            if (canSendChannel(dm)) return { channel: dm, label: `DM:${ALLOWED_DISCORD_USER}` };
        } catch (e) {
            logInteraction('ERROR', `[TEST] Failed to open DM for allowed user ${ALLOWED_DISCORD_USER}: ${e?.message || String(e)}`);
        }
    }

    return null;
}

export async function runStartupLastResponseTest(client, { ensureCDP, getLastResponseAcrossTargets }) {
    logInteraction('ACTION', '[TEST] Startup auto-test: begin latest response extraction');

    const cdp = await ensureCDP();
    if (!cdp) {
        logInteraction('ERROR', '[TEST] CDP not found during startup test.');
        return false;
    }

    const destination = await resolveStartupTestDestination(client);
    if (!destination?.channel) {
        logInteraction('ERROR',
            '[TEST] No destination channel found. Use --test-channel <channel_id> or set DISCORD_TEST_CHANNEL_ID.'
        );
        return false;
    }

    logInteraction('ACTION', `[TEST] Destination resolved: ${destination.label}`);

    let response = null;
    try {
        response = await getLastResponseAcrossTargets();
    } catch (e) {
        logInteraction('ERROR', `[TEST] getLastResponse failed: ${e?.message || String(e)}`);
        return false;
    }

    if (!response?.text) {
        logInteraction('ERROR', '[TEST] getLastResponse returned empty text.');
        try {
            await destination.channel.send({ content: '[TEST] Failed: latest response could not be extracted from current Antigravity chat.' });
        } catch (e) {
            logInteraction('ERROR', `[TEST] Failed to send extraction-failure message: ${e?.message || String(e)}`);
        }
        return false;
    }
    if (isLowConfidenceResponse(response)) {
        const lowConfidenceMsg = '[TEST] Failed: extracted content looked like IDE chrome, not chat response. Check active Antigravity window/layout.';
        logInteraction('ERROR', `${lowConfidenceMsg} (selector=${response.selector || 'n/a'}, messageRoleCount=${response.messageRoleCount || 0})`);
        try {
            await destination.channel.send({ content: lowConfidenceMsg });
        } catch (e) {
            logInteraction('ERROR', `[TEST] Failed to send low-confidence message: ${e?.message || String(e)}`);
        }
        return false;
    }

    const target = {
        content: '',
        reply: async (payload) => destination.channel.send(payload),
        followUp: async (payload) => destination.channel.send(payload),
        channel: { send: async (payload) => destination.channel.send(payload) }
    };

    const guessedPrompt = String(response?.prompt || '').trim()
        || detectPromptFromRawText(response?.text || '')
        || detectPromptFromRawText(response?.markdown || '');
    try {
        const preamble = guessedPrompt
            ? `[TEST] Extracted latest response from Antigravity. Prompt: ${guessedPrompt.slice(0, 300)}`
            : '[TEST] Extracted latest response from Antigravity.';
        await destination.channel.send({ content: preamble });
    } catch (e) {
        logInteraction('ERROR', `[TEST] Failed to send preamble message: ${e?.message || String(e)}`);
    }

    let sent = false;
    try {
        sent = await sendResponseEmbeds(target, response, guessedPrompt);
    } catch (e) {
        logInteraction('ERROR', `[TEST] sendResponseEmbeds failed: ${e?.message || String(e)}`);
    }

    if (!sent) {
        try {
            await destination.channel.send({ content: '[TEST] Failed: response extracted but local dump handling failed.' });
        } catch (e) {
            logInteraction('ERROR', `[TEST] Failed to send handling-failure message: ${e?.message || String(e)}`);
        }
        return false;
    }

    try {
        await destination.channel.send({ content: '[TEST] OK: latest response extracted and saved locally.' });
    } catch (e) {
        logInteraction('ERROR', `[TEST] Failed to send success message: ${e?.message || String(e)}`);
    }

    logInteraction('SUCCESS', '[TEST] Startup auto-test completed successfully.');
    return true;
}
