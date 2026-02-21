import { Client, GatewayIntentBits, Partials, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } from 'discord.js';
import chokidar from 'chokidar';
import 'dotenv/config';
import WebSocket from 'ws';
import http from 'http';
import https from 'https';
import readline from 'readline';
import { stdin as input, stdout as output } from 'process';
import fs from 'fs';
import path from 'path';

// 各種モジュールからのインポート
import { discoverCDP, connectCDP, ensureCDP, getCdpConnection } from './src/cdp/client.js';
import { getScreenshot, stopGeneration, injectMessage } from './src/cdp/operations.js';
import { startNewChat, getCurrentTitle, getCurrentModel, getModelList, switchModel, getCurrentMode, switchMode } from './src/cdp/workspace.js';
import { monitorAIResponse } from './src/services/aiMonitor.js';
import { logInteraction } from './src/utils/logger.js';
import { downloadFile } from './src/utils/network.js';

// --- CONFIGURATION ---
const PORTS = [9222, 9000, 9001, 9002, 9003];
const CDP_CALL_TIMEOUT = 30000;
const POLLING_INTERVAL = 2000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// State
let cdpConnection = null;
let isGenerating = false;
let lastActiveChannel = null;
// 監視対象ディレクトリ（初期化時に設定）
let WORKSPACE_ROOT = null;
const LOG_FILE = 'discord_interaction.log';

// 処理は外部ファイルへ移行

// --- CDP HELPERS ---
// 処理は外部ファイルへ移行

async function ensureWatchDir() {
    if (process.env.WATCH_DIR !== undefined) {
        if (process.env.WATCH_DIR.trim() === '') {
            WORKSPACE_ROOT = null; // 明示的に無効化
            return;
        }
        WORKSPACE_ROOT = process.env.WATCH_DIR;
        if (!fs.existsSync(WORKSPACE_ROOT)) {
            console.error(`Error: WATCH_DIR '${WORKSPACE_ROOT}' does not exist.`);
            process.exit(1);
        }
        return;
    }

    const rl = readline.createInterface({ input, output });
    console.log('\n--- 監視設定 ---');

    while (true) {
        // 空欄で監視機能無効化
        const answer = await rl.question(`監視するフォルダのパスを入力してください（空欄で監視機能を無効化）: `);
        const folderPath = answer.trim();

        if (folderPath === '') {
            console.log('🚫 監視機能を無効化しました。');
            WORKSPACE_ROOT = null;
            try {
                fs.appendFileSync('.env', `\nWATCH_DIR=`);
            } catch (e) {
                console.warn('⚠️ .envへの保存に失敗しました:', e.message);
            }
            break;
        }

        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            WORKSPACE_ROOT = folderPath;
            // .env に保存
            try {
                fs.appendFileSync('.env', `\nWATCH_DIR=${folderPath}`);
                console.log(`✅ 設定を.envに保存しました: WATCH_DIR=${folderPath}`);
            } catch (e) {
                console.warn('⚠️ .envへの保存に失敗しました:', e.message);
            }
            break;
        } else {
            console.log('❌ 無効なパスです。存在するディレクトリを指定してください。');
        }
    }
    rl.close();
}

// --- DOM SCRIPTS ---
// 処理は外部ファイルへ移行

// --- FILE WATCHER ---
function setupFileWatcher() {
    if (!WORKSPACE_ROOT) {
        console.log('🚫 File watching is disabled.');
        return;
    }
    const watcher = chokidar.watch(WORKSPACE_ROOT, { ignored: [/node_modules/, /\.git/, /discord_interaction\.log$/], persistent: true, ignoreInitial: true, awaitWriteFinish: true });
    watcher.on('all', async (event, filePath) => {
        if (!lastActiveChannel) return;
        if (event === 'unlink') {
            await lastActiveChannel.send(`🗑️ ** File Deleted:** \`${path.basename(filePath)}\``);
        } else if (event === 'add' || event === 'change') {
            const stats = fs.statSync(filePath);
            if (stats.size > 8 * 1024 * 1024) return;
            const attachment = new AttachmentBuilder(filePath);
            await lastActiveChannel.send({ content: `📁 **File ${event === 'add' ? 'Created' : 'Updated'}:** \`${path.basename(filePath)}\``, files: [attachment] });
        }
    });
}

// 処理は外部ファイルへ移行

// --- SLASH COMMANDS DEFINITION ---
const commands = [
    {
        name: 'help',
        description: 'Antigravity Bot コマンド一覧を表示',
    },
    {
        name: 'screenshot',
        description: 'Antigravityのスクリーンショットを取得',
    },
    {
        name: 'stop',
        description: 'AIの生成を停止',
    },
    {
        name: 'newchat',
        description: '新規チャットを作成',
    },
    {
        name: 'title',
        description: '現在のチャットタイトルを表示',
    },
    {
        name: 'status',
        description: '現在のモデルとモードを表示',
    },
    {
        name: 'model',
        description: 'モデル一覧表示または切替',
        options: [
            {
                name: 'number',
                description: '切り替えるモデルの番号 (未指定で一覧表示)',
                type: 4, // Integer type
                required: false,
            }
        ]
    },
    {
        name: 'mode',
        description: 'モード (Planning/Fast) を表示または切替',
        options: [
            {
                name: 'target',
                description: '切り替えるモード (planning または fast)',
                type: 3, // String type
                required: false,
                choices: [
                    { name: 'Planning', value: 'planning' },
                    { name: 'Fast', value: 'fast' }
                ]
            }
        ]
    }
];

// --- DISCORD EVENTS ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    setupFileWatcher();
    ensureCDP().then(res => {
        if (res) console.log("✅ Auto-connected to Antigravity on startup.");
        else console.log("❌ Could not auto-connect to Antigravity on startup.");
    });

    // 登録されたコマンドをDiscord APIに送信
    try {
        console.log('🔄 Started refreshing application (/) commands.');
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Failed to reload application commands:', error);
    }
});
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    lastActiveChannel = interaction.channel;
    const cdp = await ensureCDP();
    if (!cdp) {
        await interaction.reply({ content: "❌ CDP not found. Is Antigravity running?", ephemeral: true });
        return;
    }

    const { commandName } = interaction;

    if (commandName === 'help') {
        return interaction.reply(
            `📖 **Antigravity Bot コマンド一覧**\n\n` +
            `💬 **テキスト送信** — 通常のメッセージを送信\n` +
            `📎 **ファイル添付** — 画像・ファイルを添付して送信\n\n` +
            `🖼️ \`/screenshot\` — スクリーンショット取得\n` +
            `⏹️ \`/stop\` — 生成を停止\n` +
            `🆕 \`/newchat\` — 新規チャット作成\n` +
            `📊 \`/status\` — 現在のモデル・モード表示\n` +
            `📝 \`/title\` — チャットタイトル表示\n` +
            `🤖 \`/model\` — モデル一覧表示\n` +
            `🤖 \`/model <番号>\` — モデル切替\n` +
            `📋 \`/mode\` — 現在のモード表示\n` +
            `📋 \`/mode <planning|fast>\` — モード切替`
        );
    }

    if (commandName === 'screenshot') {
        await interaction.deferReply();
        const ss = await getScreenshot(cdp);
        return ss ? interaction.editReply({ files: [new AttachmentBuilder(ss, { name: 'ss.png' })] }) : interaction.editReply("Failed to capture screenshot.");
    }

    if (commandName === 'stop') {
        const stopped = await stopGeneration(cdp);
        if (stopped) {
            isGenerating = false;
            return interaction.reply({ content: '⏹️ 生成を停止しました。' });
        } else {
            return interaction.reply({ content: '⚠️ 現在生成中ではありません。', ephemeral: true });
        }
    }

    if (commandName === 'newchat') {
        const started = await startNewChat(cdp);
        if (started) {
            isGenerating = false;
            return interaction.reply({ content: '🆕 新規チャットを開始しました。' });
        } else {
            return interaction.reply({ content: '⚠️ New Chatボタンが見つかりませんでした。', ephemeral: true });
        }
    }

    if (commandName === 'title') {
        await interaction.deferReply();
        const title = await getCurrentTitle(cdp);
        return interaction.editReply(`📝 **チャットタイトル:** ${title || '不明'}`);
    }

    if (commandName === 'status') {
        await interaction.deferReply();
        const model = await getCurrentModel(cdp);
        const mode = await getCurrentMode(cdp);
        return interaction.editReply(`🤖 **モデル:** ${model || '不明'}\n📋 **モード:** ${mode || '不明'}`);
    }

    if (commandName === 'model') {
        await interaction.deferReply();
        const num = interaction.options.getInteger('number');

        if (num === null) {
            // 一覧表示
            const current = await getCurrentModel(cdp);
            const models = await getModelList(cdp);
            if (models.length === 0) return interaction.editReply('⚠️ モデル一覧を取得できませんでした。');
            const list = models.map((m, i) => `${m === current ? '▶' : '　'} **${i + 1}.** ${m}`).join('\n');
            return interaction.editReply(`🤖 **現在のモデル:** ${current || '不明'}\n\n${list}\n\n_切替: \`/model number:\`<番号>_`);
        } else {
            // モデル切り替え
            if (num < 1) return interaction.editReply('⚠️ 番号は1以上を指定してください。');
            const models = await getModelList(cdp);
            if (num > models.length) return interaction.editReply(`⚠️ 番号は1〜${models.length}で指定してください。`);
            const result = await switchModel(cdp, models[num - 1]);
            if (result.success) return interaction.editReply(`✅ **${result.model}** に切り替えました`);
            return interaction.editReply(`⚠️ 切替に失敗しました: ${result.reason}`);
        }
    }

    if (commandName === 'mode') {
        await interaction.deferReply();
        const target = interaction.options.getString('target');

        if (!target) {
            const mode = await getCurrentMode(cdp);
            return interaction.editReply(`📋 **現在のモード:** ${mode || '不明'}\n\n_切替: \`/mode target:\`<planning|fast>_`);
        } else {
            const result = await switchMode(cdp, target);
            if (result.success) return interaction.editReply(`✅ モード: **${result.mode}** に切り替えました`);
            return interaction.editReply(`⚠️ モード切替に失敗しました: ${result.reason}`);
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Ignore old slash commands that people might manually type
    if (message.content.startsWith('/')) return;
    let messageText = message.content || '';
    if (message.attachments.size > 0) {
        const uploadDir = path.join(WORKSPACE_ROOT, 'discord_uploads');
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
            const fileInfo = downloadedFiles.map(f => `[添付ファイル: ${f.name}] パス: ${f.path}`).join('\n');
            messageText = messageText ? `${messageText}\n\n${fileInfo}` : fileInfo;
            message.react('📎');
        }
    }

    if (!messageText) return;

    const cdp = await ensureCDP();
    if (!cdp) {
        return message.reply(`⚠️ Antigravityに接続できません。デバッグモードで起動しているか確認してください。`);
    }

    const res = await injectMessage(cdp, messageText);
    if (res.ok) {
        message.react('✅');
        monitorAIResponse(message, cdp);
    } else {
        message.react('❌');
        if (res.error) message.reply(`Error: ${res.error}`);
    }
});

// Main Execution
(async () => {
    try {
        if (!process.env.DISCORD_ALLOWED_USER_ID) {
            throw new Error("❌ DISCORD_ALLOWED_USER_ID is missing in .env");
        }
        await ensureWatchDir();
        console.log(`📂 Watching directory: ${WORKSPACE_ROOT}`);
        client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
})();
