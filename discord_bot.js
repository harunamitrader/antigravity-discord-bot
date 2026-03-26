// ============================================
// Antigravity Discord Bot - メインエントリポイント
// ============================================
// 各機能は src/ フォルダ内のモジュールに分割されている
// 元のモノリシックなコードは discord_bot.js.bak にバックアップ

import fs from 'fs';
import path from 'path';
import { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder, MessageFlags } from 'discord.js';

// --- モジュール読み込み ---
import {
    ALLOWED_DISCORD_USER, ALLOWED_DISCORD_USER_IS_ID,
    RUN_STARTUP_TEST, EXIT_AFTER_STARTUP_TEST, TEST_CHANNEL_ID,
    RAW_DUMP_MODE, CHAT_CHANNEL_ID
} from './src/config.js';
import { state } from './src/state.js';
import { logInteraction } from './src/logging.js';
import { ensureCDP, listAllCDPTargets } from './src/cdp_manager.js';
import {
    injectMessage, checkIsGenerating, waitForGenerationStart,
    getScreenshot, stopGeneration, startNewChat,
    getCurrentModel, getCurrentTitle, getModelList, switchModel,
    getCurrentMode, switchMode,
    getLastResponse
} from './src/dom_operations.js';
import {
    isAuthorizedDiscordUser, sendResponseEmbeds, createInteractionReplyBridge,
    canSendChannel, downloadFile, runStartupLastResponseTest
} from './src/discord_helpers.js';
import { isLowConfidenceResponse } from './src/text_processing.js';
import { ensureWatchDir, setupFileWatcher, setDiscordClient, closeFileWatcher } from './src/file_watcher.js';
import { monitorAIResponse } from './src/monitor.js';
import { restoreJobs, stopAllJobs, setScheduleTrigger } from './src/scheduler.js';

// --- Discord Client 初期化 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// --- スラッシュコマンド定義 ---
const commands = [
    {
        name: 'screenshot',
        description: 'Capture screenshot from Antigravity',
    },
    {
        name: 'stop',
        description: 'Stop generation',
    },
    {
        name: 'newchat',
        description: 'Start a new chat',
    },
    {
        name: 'last_response',
        description: 'Extract latest response and save local raw dump',
    },
    {
        name: 'model',
        description: 'Switch model (leave empty to list available models)',
        options: [
            {
                name: 'number',
                description: 'Model number to switch to',
                type: 4, // INTEGER
                required: false,
            }
        ]
    },
    {
        name: 'conversation',
        description: 'Switch conversation mode (planning/fast)',
        options: [
            {
                name: 'planning',
                description: 'Switch to Planning mode',
                type: 1, // SUB_COMMAND
            },
            {
                name: 'fast',
                description: 'Switch to Fast mode',
                type: 1, // SUB_COMMAND
            }
        ]
    },
    {
        name: 'auto',
        description: 'Enable or disable auto-approval mode',
        options: [
            {
                name: 'on',
                description: 'Enable auto-approval mode',
                type: 1, // SUB_COMMAND
            },
            {
                name: 'off',
                description: 'Disable auto-approval mode',
                type: 1, // SUB_COMMAND
            }
        ]
    },
    {
        name: 'status',
        description: 'Check current mode and auto-approval status',
    },
    {
        name: 'help',
        description: 'Show available commands and usage instructions',
    },
    {
        name: 'window',
        description: 'Manage Antigravity windows (leave number empty to list available windows)',
        options: [
            {
                name: 'number',
                description: 'Window number to select',
                type: 4, // INTEGER
                required: false,
            }
        ]
    },
    {
        name: 'restart',
        description: 'Restart the bot process',
    }
];

// --- Discord イベントハンドラ ---
client.on('error', error => {
    console.error('Discord client error:', error);
});

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('起動処理中...（数十秒かかる場合があります）');

    setupFileWatcher();
    setDiscordClient(client);

    // CDP接続とスラッシュコマンド登録を並行実行
    const cdpPromise = ensureCDP();
    const commandsPromise = (async () => {
        try {
            console.log('Started refreshing application (/) commands.');
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Failed to reload application commands:', error);
        }
    })();

    const [cdpResult] = await Promise.allSettled([cdpPromise, commandsPromise]);
    const startupCdp = cdpResult.status === 'fulfilled' ? cdpResult.value : null;

    if (startupCdp) {
        console.log('Auto-connected to Antigravity on startup.');
    } else {
        console.log('Could not auto-connect to Antigravity on startup.');
    }

    // --- スケジューラ初期化 ---
    setScheduleTrigger(async (meta) => {
        const channel = state.lastActiveChannel
            || (CHAT_CHANNEL_ID ? await client.channels.fetch(CHAT_CHANNEL_ID).catch(() => null) : null);

        const cdp = await ensureCDP();
        if (!cdp) {
            if (channel) await channel.send(`⚠️ Job #${meta.number}: CDP not found. Skipping.`);
            return;
        }

        const res = await injectMessage(cdp, meta.message);
        if (res.ok) {
            if (channel) {
                const msg = await channel.send(`⏰ Job #${meta.number}: \`${meta.message}\``);
                monitorAIResponse(msg, cdp);
            }
        } else {
            if (channel) await channel.send(`⚠️ Job #${meta.number}: Failed to inject message.`);
        }
    });
    restoreJobs();

    console.log('起動完了');

    // Discordに起動完了通知を送信
    try {
        let notifyChannel = null;
        // 1. CHAT_CHANNEL_ID が設定されていればそのチャンネル
        if (CHAT_CHANNEL_ID) {
            notifyChannel = await client.channels.fetch(CHAT_CHANNEL_ID).catch(() => null);
        }
        // 2. lastActiveChannel
        if (!notifyChannel && canSendChannel(state.lastActiveChannel)) {
            notifyChannel = state.lastActiveChannel;
        }
        // 3. 許可ユーザーにDM
        if (!notifyChannel && ALLOWED_DISCORD_USER_IS_ID) {
            const user = await client.users.fetch(ALLOWED_DISCORD_USER).catch(() => null);
            if (user) notifyChannel = await user.createDM().catch(() => null);
        }
        if (notifyChannel) {
            await notifyChannel.send('✅ Bot 起動完了');
        }
    } catch (e) {
        console.error('Failed to send startup notification:', e.message);
    }

    if (RUN_STARTUP_TEST) {
        console.log('[TEST] Startup test mode enabled (--test).');
        if (!TEST_CHANNEL_ID && !ALLOWED_DISCORD_USER_IS_ID && !canSendChannel(state.lastActiveChannel)) {
            console.error('[TEST] Destination is not configured. Provide --test-channel <channel_id> (recommended).');
            if (EXIT_AFTER_STARTUP_TEST) {
                setTimeout(() => process.exit(1), 500);
            }
            return;
        }
        const ok = await runStartupLastResponseTest(client, { ensureCDP, getLastResponseAcrossTargets });
        if (EXIT_AFTER_STARTUP_TEST) {
            const exitCode = ok ? 0 : 1;
            console.log(`[TEST] Completed. Exiting with code ${exitCode}.`);
            setTimeout(() => process.exit(exitCode), 800);
        } else {
            console.log('[TEST] Completed. Keeping bot alive because --test-keepalive is enabled.');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!isAuthorizedDiscordUser(interaction.user)) {
        logInteraction('SECURITY', `Unauthorized access attempt from UserID: ${interaction.user.id} (${interaction.user.username})`);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
            } catch (e) {
                if (e?.code !== 10062) {
                    console.error('Failed to send unauthorized reply:', e);
                }
            }
        }
        return;
    }

    try {
        state.lastActiveChannel = interaction.channel;
        const { commandName } = interaction;

        await interaction.deferReply();

        if (commandName === 'window') {
            const num = interaction.options.getInteger('number');
            const targets = await listAllCDPTargets();

            if (num === null) {
                if (targets.length === 0) {
                    await interaction.editReply('No available windows found.');
                    return;
                }

                const selected = state.explicitTargetUrl;
                const list = targets.map((t, i) => {
                    const isSelected = selected === t.webSocketDebuggerUrl;
                    return `${isSelected ? '>' : ' '} ${i + 1}. ${t.title} (port ${t.port})`;
                }).join('\n');

                await interaction.editReply(`Available windows:\n\n${list}\n\nUse /window number:<n> to select one.`);
                return;
            }

            if (num < 1 || num > targets.length) {
                await interaction.editReply(`Number must be between 1 and ${targets.length}.`);
                return;
            }

            const target = targets[num - 1];
            state.explicitTargetUrl = target.webSocketDebuggerUrl;

            if (state.cdpConnection) {
                state.cdpConnection.ws.close();
                state.cdpConnection = null;
            }

            const newCdp = await ensureCDP();
            if (newCdp) {
                await interaction.editReply(`Selected window: ${target.title}`);
                return;
            }
            await interaction.editReply(`Failed to connect to: ${target.title}`);
            return;
        }

        const cdp = await ensureCDP();
        if (!cdp) {
            await interaction.editReply('CDP not found. Is Antigravity running?');
            return;
        }

        if (commandName === 'screenshot') {
            const ss = await getScreenshot(cdp);
            if (ss) {
                await interaction.editReply({ files: [new AttachmentBuilder(ss, { name: 'ss.png' })] });
            } else {
                await interaction.editReply('Failed to capture screenshot.');
            }
            return;
        }

        if (commandName === 'stop') {
            const stopped = await stopGeneration(cdp);
            if (stopped) {
                state.isGenerating = false;
                await interaction.editReply('Generation stopped.');
            } else {
                await interaction.editReply('No active generation.');
            }
            return;
        }

        if (commandName === 'newchat') {
            const result = await startNewChat(cdp);
            if (!result.success) {
                const reason = result.reason || 'unknown';
                await interaction.editReply(`New chat did not complete. reason=${reason} (see discord_interaction.log)`);
                return;
            }

            state.isGenerating = false;
            await new Promise(r => setTimeout(r, 3000));

            logInteraction('NEWCHAT', 'New chat request only.');
            await interaction.editReply('New chat request completed.');
            return;
        }

        if (commandName === 'last_response') {
            await interaction.editReply('Extracting latest response from current Antigravity chat...');
            let response = null;
            try {
                response = await getLastResponse(cdp);
            } catch (e) {
                logInteraction('ERROR', `last_response extraction failed: ${e?.message || String(e)}`);
            }

            if (!response?.text) {
                await interaction.editReply('No response could be extracted from the current chat history.');
                return;
            }
            if (isLowConfidenceResponse(response)) {
                await interaction.editReply('Extraction failed: detected IDE chrome content instead of chat history. Check active Antigravity window.');
                return;
            }

            let sent = false;
            try {
                sent = await sendResponseEmbeds(createInteractionReplyBridge(interaction, ''), response, '');
            } catch (e) {
                logInteraction('ERROR', `last_response sendResponseEmbeds failed: ${e?.message || String(e)}`);
            }

            if (sent) {
                await interaction.editReply('Latest response extracted and saved locally.');
            } else {
                await interaction.editReply('Response extraction succeeded, but local dump handling failed.');
            }
            return;
        }

        if (commandName === 'model') {
            const num = interaction.options.getInteger('number');

            if (num === null) {
                const current = await getCurrentModel(cdp);
                const models = await getModelList(cdp);
                if (models.length === 0) {
                    await interaction.editReply('Could not read model list.');
                    return;
                }
                const list = models.map((m, i) => `${m === current ? '>' : ' '} ${i + 1}. ${m}`).join('\n');
                await interaction.editReply(`Current model: ${current || 'unknown'}\n\n${list}\n\nUse /model number:<n> to switch.`);
                return;
            }

            if (num < 1) {
                await interaction.editReply('Number must be >= 1.');
                return;
            }
            const models = await getModelList(cdp);
            if (num > models.length) {
                await interaction.editReply(`Number must be between 1 and ${models.length}.`);
                return;
            }
            const result = await switchModel(cdp, models[num - 1]);
            if (result.success) {
                await interaction.editReply(`Switched model to ${result.model}.`);
            } else {
                await interaction.editReply(`Failed to switch model: ${result.reason}`);
            }
            return;
        }

        if (commandName === 'conversation') {
            const subcommand = interaction.options.getSubcommand();

            const result = await switchMode(cdp, subcommand);
            if (result.success) {
                await interaction.editReply(`Switched conversation mode to ${result.mode}.`);
            } else {
                await interaction.editReply(`Failed to switch mode: ${result.reason}`);
            }
            return;
        }

        if (commandName === 'auto') {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'on') {
                state.autoApproveMode = true;
                await interaction.editReply('Auto-approval mode has been turned **ON**.');
            } else if (subcommand === 'off') {
                state.autoApproveMode = false;
                await interaction.editReply('Auto-approval mode has been turned **OFF**.');
            }
            return;
        }

        if (commandName === 'status') {
            const title = await getCurrentTitle(cdp);
            const model = await getCurrentModel(cdp);
            const mode = await getCurrentMode(cdp);

            let currentWindowStr = 'unknown';
            try {
                const targets = await listAllCDPTargets();
                const activeTarget = targets.find(t => t.webSocketDebuggerUrl === state.explicitTargetUrl) || targets[0];
                if (activeTarget) {
                    currentWindowStr = activeTarget.title || 'unnamed window';
                }
            } catch (e) {
                console.error('Failed to get current window for status:', e);
            }

            const modeStr = mode || 'unknown';
            const autoStr = state.autoApproveMode ? 'ON' : 'OFF';
            await interaction.editReply(`**Antigravity Status**\n- Title: \`${title || 'unknown'}\`\n- Model: \`${model || 'unknown'}\`\n- Mode: \`${modeStr}\`\n- Auto-approval: \`${autoStr}\`\n- Window: \`${currentWindowStr}\``);
            return;
        }

        if (commandName === 'restart') {
            logInteraction('RESTART', 'Bot restart requested via /restart command.');
            await interaction.editReply('Restarting bot... (start_bot.bat で起動している場合、自動で再起動されます)');
            setTimeout(() => process.exit(42), 1500);
            return;
        }

        if (commandName === 'help') {
            const helpText = `
**Antigravity Discord Bot Commands**

**/status**
Check the current Antigravity title, model, mode, and auto-approval state.

**/auto [on|off]**
Manage auto-approval mode for \`Run\` and \`Allow Once\` actions.
- \`/auto on\`: Enables auto-approval.
- \`/auto off\`: Disables auto-approval.

**/model [list|number]**
Switch the AI model (e.g., GPT-4, Claude 3).
- \`/model\`: Lists available models.
- \`/model number:1\`: Selects model #1 from the list.

**/conversation [planning|fast]**
Switch the agent's operating mode.
- \`/conversation planning\`: Switches to Planning mode (waits for approval).
- \`/conversation fast\`: Switches to Fast mode (acts immediately).

**/window [number]**
Manage which VSCode/IDE window to connect to via CDP.
- \`/window\`: Lists available windows.
- \`/window number:1\`: Selects window #1 from the list.

**/restart**
Restart the bot process. Requires start_bot.bat for auto-restart.

**Scheduled Jobs**
Managed via \`data/jobs/*.json\` files. Use Antigravity (AI chat) to add/edit/remove jobs.
`;
            await interaction.editReply(helpText.trim());
            return;
        }
    } catch (error) {
        console.error('Interaction Error:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `Error: ${error.message}` });
            } else {
                await interaction.reply({ content: `Error: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        } catch (innerError) {
            console.error('Failed to send error reply:', innerError);
        }
    }
});

client.on('messageCreate', async message => {
    if (!isAuthorizedDiscordUser(message.author)) return;
    if (message.author.bot) return;

    if (message.content.startsWith('/')) return;
    state.lastActiveChannel = message.channel;
    let messageText = message.content || '';

    const messageCommand = String(messageText || '').trim().toLowerCase();

    if (messageCommand === '!last_response' || messageCommand === '!lastresponse' || messageCommand === '!lr') {
        const cdp = await ensureCDP();
        if (!cdp) {
            await message.reply('CDP not found. Is Antigravity running?');
            return;
        }

        let response = null;
        try {
            response = await getLastResponse(cdp);
        } catch (e) {
            logInteraction('ERROR', `message last_response extraction failed: ${e?.message || String(e)}`);
        }

        if (!response?.text) {
            await message.reply('No response could be extracted from current chat history.');
            return;
        }
        if (isLowConfidenceResponse(response)) {
            await message.reply('Extraction failed: detected IDE chrome content instead of chat history. Check active Antigravity window.');
            return;
        }

        let sent = false;
        try {
            sent = await sendResponseEmbeds(message, response, '');
        } catch (e) {
            logInteraction('ERROR', `message last_response sendResponseEmbeds failed: ${e?.message || String(e)}`);
        }
        if (!sent) {
            await message.reply('Response extraction succeeded, but local dump handling failed.');
        }
        return;
    }

    if (message.attachments.size > 0) {
        const uploadDir = path.join(state.WORKSPACE_ROOT, 'discord_uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const downloadedFiles = [];
        for (const [, attachment] of message.attachments) {
            try {
                const fileName = `${Date.now()}_${path.basename(attachment.name)}`;
                const filePath = path.join(uploadDir, fileName);
                const fileData = await downloadFile(attachment.url);
                fs.writeFileSync(filePath, fileData);
                downloadedFiles.push({ name: attachment.name, path: filePath });
                logInteraction('UPLOAD', `Downloaded: ${attachment.name} -> ${filePath}`);
            } catch (e) {
                logInteraction('UPLOAD_ERROR', `Failed to download ${attachment.name}: ${e.message}`);
            }
        }

        if (downloadedFiles.length > 0) {
            const fileInfo = downloadedFiles.map(f => `[attachment: ${f.name}] saved at ${f.path}`).join('\n');
            messageText = messageText ? `${messageText}\n\n${fileInfo}` : fileInfo;
        }
    }

    if (!messageText) return;
    const cdp = await ensureCDP();
    if (!cdp) return;

    const res = await injectMessage(cdp, messageText);
    if (res.ok) {
        try {
            await message.react('✅');
        } catch (e) {
            console.error('Failed to react to message:', e);
        }
        monitorAIResponse(message, cdp);
    } else {
        if (res.error) message.reply(`Error: ${res.error}`);
    }
});

// --- メイン実行 ---
(async () => {
    try {
        if (!ALLOWED_DISCORD_USER) {
            throw new Error('DISCORD_ALLOWED_USER_ID is missing in .env');
        }
        if (!ALLOWED_DISCORD_USER_IS_ID) {
            console.warn('[CONFIG] DISCORD_ALLOWED_USER_ID is not numeric. Username fallback is active; Discord user ID is recommended.');
        }
        await ensureWatchDir();
        console.log(`Watching directory: ${state.WORKSPACE_ROOT || '(disabled)'}`);
        if (RUN_STARTUP_TEST) {
            console.log('[TEST] --test detected. Startup auto-test will run after login.');
            if (TEST_CHANNEL_ID) {
                console.log(`[TEST] Using DISCORD_TEST_CHANNEL_ID=${TEST_CHANNEL_ID}`);
            } else {
                console.log('[TEST] No test channel configured. Set --test-channel <channel_id> or DISCORD_TEST_CHANNEL_ID.');
            }
        }
        await client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (e) {
        console.error('Fatal Error during login:', e.message);
        await gracefulShutdown();
    }
})();

// --- 終了時のクリーンアップ処理 (UV Handle エラー対策) ---
let isShuttingDown = false;
async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[SHUTDOWN] Closing connections...');

    stopAllJobs();
    closeFileWatcher();
    if (state.cdpConnection && state.cdpConnection.ws) {
        try { state.cdpConnection.ws.close(); } catch (e) { }
    }
    if (client) {
        try { client.destroy(); } catch (e) { }
    }

    // 短い遅延を入れて非同期ハンドラのクローズを待つ
    setTimeout(() => {
        process.exit(0);
    }, 200);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
