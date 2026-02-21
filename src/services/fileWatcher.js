import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { AttachmentBuilder } from 'discord.js';

let activeChannel = null;
let watcherInstance = null;
let workspaceRoot = null;

export function setFileWatcherConfig(root, channel) {
    workspaceRoot = root;
    activeChannel = channel;
}

export function updateFileWatcherChannel(channel) {
    activeChannel = channel;
}

export function setupFileWatcher() {
    if (!workspaceRoot) {
        console.log('🚫 File watching is disabled.');
        return;
    }

    if (watcherInstance) {
        watcherInstance.close();
    }

    watcherInstance = chokidar.watch(workspaceRoot, {
        ignored: [/node_modules/, /\.git/, /discord_interaction\.log$/],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: true
    });

    watcherInstance.on('all', async (event, filePath) => {
        if (!activeChannel) return;

        if (event === 'unlink') {
            await activeChannel.send(`🗑️ **File Deleted:** \`${path.basename(filePath)}\``);
        } else if (event === 'add' || event === 'change') {
            try {
                const stats = fs.statSync(filePath);
                if (stats.size > 8 * 1024 * 1024) return;
                const attachment = new AttachmentBuilder(filePath);
                await activeChannel.send({
                    content: `📁 **File ${event === 'add' ? 'Created' : 'Updated'}:** \`${path.basename(filePath)}\``,
                    files: [attachment]
                });
            } catch (e) {
                console.error("Error reading modified file:", e.message);
            }
        }
    });
}
