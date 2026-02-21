import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { stdin as input, stdout as output } from 'process';

import { ensureCDP } from './cdp/client.js';
import { setupFileWatcher, setFileWatcherConfig } from './services/fileWatcher.js';
import { commands } from './discord/commands.js';
import { handleInteraction, handleMessageCreate, handleThreadCreate, handleChannelDelete } from './discord/events.js';
import { initSchedules } from './discord/commands/schedule.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

let WORKSPACE_ROOT = null;

async function ensureWatchDir() {
    if (process.env.WATCH_DIR !== undefined) {
        if (process.env.WATCH_DIR.trim() === '') {
            WORKSPACE_ROOT = null;
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
        const answer = await rl.question(`監視するフォルダのパスを入力してください（空欄で監視機能を無効化）: `);
        const folderPath = answer.trim();

        if (folderPath === '') {
            console.log('🚫 監視機能を無効化しました。');
            WORKSPACE_ROOT = null;
            try { fs.appendFileSync('.env', `\nWATCH_DIR=`); } catch (e) { }
            break;
        }

        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            WORKSPACE_ROOT = folderPath;
            try { fs.appendFileSync('.env', `\nWATCH_DIR=${folderPath}`); } catch (e) { }
            console.log(`✅ 設定を.envに保存しました: WATCH_DIR=${folderPath}`);
            break;
        } else {
            console.log('❌ 無効なパスです。存在するディレクトリを指定してください。');
        }
    }
    rl.close();
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    setFileWatcherConfig(WORKSPACE_ROOT, null);
    setupFileWatcher();


    ensureCDP().then(res => {
        if (res) console.log("✅ Auto-connected to Antigravity on startup.");
        else console.log("❌ Could not auto-connect to Antigravity on startup.");
    });

    initSchedules(client);

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
    const cdp = await ensureCDP(interaction.channelId);
    await handleInteraction(interaction, cdp);
});

client.on('messageCreate', async message => {
    const cdp = await ensureCDP(message.channelId);
    await handleMessageCreate(message, cdp, WORKSPACE_ROOT);
});

client.on('threadCreate', async (thread, newlyCreated) => {
    await handleThreadCreate(thread, newlyCreated, ensureCDP);
});

client.on('channelDelete', async channel => {
    await handleChannelDelete(channel);
});

client.on('threadDelete', async thread => {
    await handleChannelDelete(thread);
});

(async () => {
    try {
        if (!process.env.DISCORD_ALLOWED_USER_ID) {
            throw new Error("❌ DISCORD_ALLOWED_USER_ID is missing in .env");
        }
        await ensureWatchDir();
        console.log(`📂 Watching directory: ${WORKSPACE_ROOT || 'None (Disabled)'}`);
        client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
})();
