import fs from 'fs';
import path from 'path';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../utils/embeds.js';
import { injectMessage } from '../../cdp/operations.js';
import { monitorAIResponse } from '../../services/aiMonitor.js';

const TEMPLATES_FILE = path.join(process.cwd(), 'src/data/templates.json');

function loadTemplates() {
    try {
        if (!fs.existsSync(TEMPLATES_FILE)) return {};
        return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
    } catch (e) {
        console.error('Failed to load templates.json:', e);
        return {};
    }
}

function saveTemplates(data) {
    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save templates.json:', e);
    }
}

export async function handleTemplateCommand(interaction, cdp) {
    const subCommand = interaction.options.getSubcommand();
    const templates = loadTemplates();

    if (subCommand === 'add') {
        const name = interaction.options.getString('name');
        const text = interaction.options.getString('text');
        templates[name] = text;
        saveTemplates(templates);
        return interaction.reply({ embeds: [createSuccessEmbed(`テンプレート '${name}' を登録しました`, text)] });
    }

    if (subCommand === 'list') {
        const names = Object.keys(templates);
        if (names.length === 0) {
            return interaction.reply({ embeds: [createInfoEmbed('登録されているテンプレートはありません')] });
        }
        const listText = names.map(n => `・**${n}**: ${templates[n].substring(0, 50)}${templates[n].length > 50 ? '...' : ''}`).join('\n');
        return interaction.reply({ embeds: [createInfoEmbed('登録済みテンプレート', listText)] });
    }

    if (subCommand === 'delete') {
        const name = interaction.options.getString('name');
        if (!templates[name]) {
            return interaction.reply({ embeds: [createErrorEmbed(`テンプレート '${name}' は見つかりません`)] });
        }
        delete templates[name];
        saveTemplates(templates);
        return interaction.reply({ embeds: [createSuccessEmbed(`テンプレート '${name}' を削除しました`)] });
    }

    if (subCommand === 'use') {
        const name = interaction.options.getString('name');
        const text = templates[name];

        if (!text) {
            return interaction.reply({ embeds: [createErrorEmbed(`テンプレート '${name}' は見つかりません`)] });
        }

        if (!cdp) {
            return interaction.reply({ embeds: [createErrorEmbed('Antigravityとの接続エラー', 'CDP接続が見つかりません。デバッグモードで起動しているか確認してください。')] });
        }

        await interaction.reply({ embeds: [createInfoEmbed(`テンプレート '${name}' を使用して生成を開始します`, text)] });

        // Execute the prompt
        // Need to simulate a message object for monitorAIResponse if we want to reply there.
        // Or we can just reply in the channel directly.
        const res = await injectMessage(cdp, text);
        if (res.ok) {
            // Note: monitorAIResponse takes the message to reply to. We can pass the interaction message.
            const replyMsg = await interaction.fetchReply();
            monitorAIResponse(replyMsg, cdp);
        } else {
            return interaction.followUp({ embeds: [createErrorEmbed('生成開始エラー', res.error)] });
        }
    }
}
