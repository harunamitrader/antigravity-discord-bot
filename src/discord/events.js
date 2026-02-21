import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { getScreenshot, stopGeneration, injectMessage } from '../cdp/operations.js';
import { startNewChat, getCurrentTitle, getCurrentModel, getModelList, switchModel, getCurrentMode, switchMode } from '../cdp/workspace.js';
import { setIsGenerating, monitorAIResponse } from '../services/aiMonitor.js';
import { handleTemplateCommand } from './commands/template.js';
import { handleScheduleCommand } from './commands/schedule.js';
import { handleWorkspaceCommand, loadWorkspaces, saveWorkspace } from './commands/workspace.js';
import { logInteraction } from '../utils/logger.js';
import { createInfoEmbed } from '../utils/embeds.js';
import { downloadFile } from '../utils/network.js';
import { updateFileWatcherChannel } from '../services/fileWatcher.js';

export async function handleInteraction(interaction, cdp) {
    if (!interaction.isChatInputCommand()) return;

    updateFileWatcherChannel(interaction.channel);

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
            setIsGenerating(false);
            return interaction.reply({ content: '⏹️ 生成を停止しました。' });
        } else {
            return interaction.reply({ content: '⚠️ 現在生成中ではありません。', ephemeral: true });
        }
    }

    if (commandName === 'newchat') {
        const started = await startNewChat(cdp);
        if (started) {
            setIsGenerating(false);
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
            const current = await getCurrentModel(cdp);
            const models = await getModelList(cdp);
            if (models.length === 0) return interaction.editReply('⚠️ モデル一覧を取得できませんでした。');
            const list = models.map((m, i) => `${m === current ? '▶' : '　'} **${i + 1}.** ${m}`).join('\n');
            return interaction.editReply(`🤖 **現在のモデル:** ${current || '不明'}\n\n${list}\n\n_切替: \`/model number:\`<番号>_`);
        } else {
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

    if (commandName === 'template') {
        return handleTemplateCommand(interaction, cdp);
    }

    if (commandName === 'schedule') {
        return handleScheduleCommand(interaction, interaction.client);
    }

    if (commandName === 'workspace') {
        return handleWorkspaceCommand(interaction);
    }
}

export async function handleMessageCreate(message, cdp, workspaceRoot) {
    if (message.author.bot) return;
    if (message.content.startsWith('/')) return;

    let messageText = message.content || '';
    if (message.attachments.size > 0 && workspaceRoot) {
        const uploadDir = path.join(workspaceRoot, 'discord_uploads');
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

    if (!cdp) {
        return message.reply(`⚠️ Antigravityに接続できません。デバッグモードで起動しているか確認してください。`);
    }

    updateFileWatcherChannel(message.channel);

    const res = await injectMessage(cdp, messageText);
    if (res.ok) {
        message.react('✅');
        monitorAIResponse(message, cdp);
    } else {
        message.react('❌');
        if (res.error) message.reply(`Error: ${res.error}`);
    }
}

export async function handleThreadCreate(thread, newlyCreated, ensureCDP) {
    if (!newlyCreated) return;

    const parentId = thread.parentId;
    if (parentId) {
        const workspaces = loadWorkspaces();
        if (workspaces[parentId]) {
            saveWorkspace(thread.id, workspaces[parentId]);
        }
    }

    const cdp = await ensureCDP(thread.id);
    if (cdp) {
        logInteraction('THREAD', `Syncing new thread ${thread.id} to new Antigravity chat.`);
        const started = await startNewChat(cdp);
        if (started) {
            await thread.send({ embeds: [createInfoEmbed('スレッド同期', 'Antigravity側でも新しいチャットを開始しました。')] });
        }
    }
}
