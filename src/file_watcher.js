// --- ファイル監視 ---
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import readline from 'readline';
import { AttachmentBuilder } from 'discord.js';
import { FILE_LOG_CHANNEL_ID } from './config.js';
import { state } from './state.js';

// Discord clientの参照（discord_bot.jsから設定される）
let _discordClient = null;
export function setDiscordClient(client) {
    _discordClient = client;
}

export async function ensureWatchDir() {
    if (process.env.WATCH_DIR !== undefined) {
        if (process.env.WATCH_DIR.trim() === '') {
            state.WORKSPACE_ROOT = null;
            return;
        }
        state.WORKSPACE_ROOT = process.env.WATCH_DIR;
        if (!fs.existsSync(state.WORKSPACE_ROOT) || !fs.statSync(state.WORKSPACE_ROOT).isDirectory()) {
            console.error(`Error: WATCH_DIR '${state.WORKSPACE_ROOT}' does not exist or is not a directory.`);
            process.exit(1);
        }
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n--- Watch Directory Setup ---');

    while (true) {
        const answer = await new Promise(resolve => rl.question('Enter watch directory (blank to disable): ', resolve));
        const folderPath = (answer || '').trim();

        if (folderPath === '') {
            console.log('Watching is disabled.');
            state.WORKSPACE_ROOT = null;
            try {
                fs.appendFileSync('.env', '\nWATCH_DIR=');
            } catch (e) {
                console.warn('Warning: failed to save WATCH_DIR to .env:', e.message);
            }
            break;
        }

        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            state.WORKSPACE_ROOT = folderPath;
            try {
                fs.appendFileSync('.env', `\nWATCH_DIR=${folderPath}`);
                console.log(`Saved WATCH_DIR=${folderPath} to .env`);
            } catch (e) {
                console.warn('Warning: failed to save WATCH_DIR to .env:', e.message);
            }
            break;
        }

        console.log('Invalid path. Please enter an existing directory.');
    }

    rl.close();
}

let currentWatcher = null;

export function setupFileWatcher() {
    if (!state.WORKSPACE_ROOT) {
        console.log('File watching is disabled.');
        return;
    }

    currentWatcher = chokidar.watch(state.WORKSPACE_ROOT, {
        ignored: [/node_modules/, /\.git/, /discord_interaction\.log$/],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: true
    });

    currentWatcher.on('all', async (event, filePath) => {
        // 送信先チャンネルの決定: FILE_LOG_CHANNEL_ID > lastActiveChannel
        let channel = null;
        if (FILE_LOG_CHANNEL_ID && _discordClient) {
            try { channel = await _discordClient.channels.fetch(FILE_LOG_CHANNEL_ID); } catch (e) { }
        }
        if (!channel) channel = state.lastActiveChannel;
        if (!channel) return;

        try {
            if (event === 'unlink') {
                await channel.send(`** File Deleted:** \`${path.basename(filePath)}\``);
                return;
            }

            if (event === 'add' || event === 'change') {
                if (!fs.existsSync(filePath)) return;
                const stats = fs.statSync(filePath);
                if (stats.size > 8 * 1024 * 1024) return;

                const attachment = new AttachmentBuilder(filePath);
                const label = event === 'add' ? 'Created' : 'Updated';
                await channel.send({
                    content: `**File ${label}:** \`${path.basename(filePath)}\``,
                    files: [attachment]
                });
            }
        } catch (e) {
            console.error('File watcher send error:', e.message);
        }
    });
}

export function closeFileWatcher() {
    if (currentWatcher) {
        currentWatcher.close();
        currentWatcher = null;
    }
}
