import fs from 'fs';
import path from 'path';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../utils/embeds.js';
import { getJson } from '../../utils/network.js';

const WORKSPACES_FILE = path.join(process.cwd(), 'src/data/workspaces.json');
const PORTS = [9222, 9000, 9001, 9002, 9003];

export function loadWorkspaces() {
    try {
        if (!fs.existsSync(WORKSPACES_FILE)) return {};
        return JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8'));
    } catch (e) { return {}; }
}

export function saveWorkspace(channelId, targetUrl) {
    const data = loadWorkspaces();
    data[channelId] = targetUrl;
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2));
}

export async function handleWorkspaceCommand(interaction) {
    const subCommand = interaction.options.getSubcommand();

    if (subCommand === 'list') {
        const targets = [];
        for (const port of PORTS) {
            try {
                const list = await getJson(`http://127.0.0.1:${port}/json/list`);
                for (const t of list) {
                    if (t.webSocketDebuggerUrl && (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade') || t.title.includes('Launchpad'))) {
                        targets.push(t);
                    }
                }
            } catch (e) { }
        }

        if (targets.length === 0) {
            return interaction.reply({ embeds: [createErrorEmbed('Antigravityが見つかりません', '起動しているか、デバッグポートが有効か確認してください。')] });
        }

        const listText = targets.map((t, i) => `**${i + 1}.** ${t.title}\n└ \`${t.url}\``).join('\n\n');
        return interaction.reply({ embeds: [createInfoEmbed('検出されたワークスペース', listText + '\n\n`/workspace bind <番号>` で現在のチャンネルに紐づけます。')] });
    }

    if (subCommand === 'bind') {
        const num = interaction.options.getInteger('number');
        if (num < 1) return interaction.reply({ embeds: [createErrorEmbed('無効な番号です')] });

        const targets = [];
        for (const port of PORTS) {
            try {
                const list = await getJson(`http://127.0.0.1:${port}/json/list`);
                for (const t of list) {
                    if (t.webSocketDebuggerUrl && (t.url.includes('workbench') || t.title.includes('Antigravity') || t.title.includes('Cascade'))) {
                        targets.push(t);
                    }
                }
            } catch (e) { }
        }

        if (num > targets.length) return interaction.reply({ embeds: [createErrorEmbed('無効な番号です', `1から${targets.length}の間で指定してください。`)] });

        const target = targets[num - 1];
        saveWorkspace(interaction.channelId, target.webSocketDebuggerUrl);
        return interaction.reply({ embeds: [createSuccessEmbed('ワークスペースを紐づけました', `このチャンネルは **${target.title}** に接続されます。`)] });
    }
}
