import fs from 'fs';
import path from 'path';
import schedule from 'node-schedule';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../utils/embeds.js';
import { injectMessage } from '../../cdp/operations.js';
import { getCdpConnection } from '../../cdp/client.js';
import { logInteraction } from '../../utils/logger.js';
import { monitorAIResponse } from '../../services/aiMonitor.js';

const SCHEDULES_FILE = path.join(process.cwd(), 'src/data/schedules.json');
const activeJobs = {};

function loadSchedules() {
    try {
        if (!fs.existsSync(SCHEDULES_FILE)) return {};
        return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8'));
    } catch (e) {
        console.error('Failed to load schedules.json:', e);
        return {};
    }
}

function saveSchedules(data) {
    try {
        fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save schedules.json:', e);
    }
}

export function initSchedules(client) {
    const schedules = loadSchedules();
    for (const [name, data] of Object.entries(schedules)) {
        scheduleJob(name, data.cron, data.text, data.channelId, client);
    }
    logInteraction('SCHEDULE', `Loaded ${Object.keys(schedules).length} schedules.`);
}

function scheduleJob(name, cron, text, channelId, client) {
    if (activeJobs[name]) {
        activeJobs[name].cancel();
    }

    // Support parsing plain Date strings (e.g. YYYY-MM-DD HH:mm) or cron strings
    let scheduleTime = cron;
    if (new Date(cron).toString() !== 'Invalid Date' && isNaN(cron)) {
        scheduleTime = new Date(cron);
    }

    try {
        const job = schedule.scheduleJob(scheduleTime, async () => {
            logInteraction('SCHEDULE_RUN', `Running schedule: ${name}`);
            const cdp = getCdpConnection();
            if (!cdp) {
                logInteraction('SCHEDULE_FAIL', `CDP not connected. Could not run ${name}`);
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                logInteraction('SCHEDULE_FAIL', `Channel ${channelId} not found.`);
                return;
            }

            const msg = await channel.send({ embeds: [createInfoEmbed(`⏰ スケジュール実行: ${name}`, text)] });
            const res = await injectMessage(cdp, text);
            if (res.ok) {
                monitorAIResponse(msg, cdp);
            } else {
                channel.send({ embeds: [createErrorEmbed('実行エラー', res.error)] });
            }
        });

        if (job) {
            activeJobs[name] = job;
            return true;
        }
    } catch (e) {
        logInteraction('SCHEDULE_ERROR', `Invalid cron: ${cron}`);
    }
    return false;
}

export async function handleScheduleCommand(interaction, client) {
    const subCommand = interaction.options.getSubcommand();
    const schedules = loadSchedules();

    if (subCommand === 'add') {
        const name = interaction.options.getString('name');
        const cron = interaction.options.getString('cron');
        const text = interaction.options.getString('text');

        const success = scheduleJob(name, cron, text, interaction.channelId, client);
        if (!success) {
            return interaction.reply({ embeds: [createErrorEmbed('登録エラー', '無効な日時またはcron式です。')] });
        }

        schedules[name] = { cron, text, channelId: interaction.channelId };
        saveSchedules(schedules);

        return interaction.reply({ embeds: [createSuccessEmbed(`スケジュール '${name}' を登録しました`, `実行タイミング: ${cron}\n内容: ${text}`)] });
    }

    if (subCommand === 'list') {
        const names = Object.keys(schedules);
        if (names.length === 0) {
            return interaction.reply({ embeds: [createInfoEmbed('登録されているスケジュールはありません')] });
        }
        const listText = names.map(n => `・**${n}** (${schedules[n].cron}): ${schedules[n].text.substring(0, 30)}...`).join('\n');
        return interaction.reply({ embeds: [createInfoEmbed('登録済みスケジュール', listText)] });
    }

    if (subCommand === 'delete') {
        const name = interaction.options.getString('name');
        if (!schedules[name]) {
            return interaction.reply({ embeds: [createErrorEmbed(`スケジュール '${name}' は見つかりません`)] });
        }

        if (activeJobs[name]) {
            activeJobs[name].cancel();
            delete activeJobs[name];
        }

        delete schedules[name];
        saveSchedules(schedules);
        return interaction.reply({ embeds: [createSuccessEmbed(`スケジュール '${name}' を削除しました`)] });
    }
}
