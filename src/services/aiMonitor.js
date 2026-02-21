import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logInteraction } from '../utils/logger.js';
import { checkApprovalRequired, clickApproval } from '../cdp/approval.js';
import { checkIsGenerating, getLastResponse } from '../cdp/operations.js';

const POLLING_INTERVAL = 2000;

// Store state per channel ID
const activeMonitors = new Map();
const lastApprovalMessages = new Map();

export function getIsGenerating(channelId) {
    return activeMonitors.get(channelId) || false;
}

export function setIsGenerating(channelId, value) {
    if (value) {
        activeMonitors.set(channelId, true);
    } else {
        activeMonitors.delete(channelId);
    }
}

export function stopMonitoring(channelId) {
    activeMonitors.delete(channelId);
    lastApprovalMessages.delete(channelId);
}

export async function monitorAIResponse(originalMessage, cdp) {
    const channelId = originalMessage.channelId;
    if (activeMonitors.get(channelId)) {
        logInteraction('MONITOR', `Ignored monitor request for channel ${channelId} because already generating`);
        return;
    }
    activeMonitors.set(channelId, true);
    logInteraction('MONITOR', `Started AI response monitoring for channel ${channelId}`);

    let stableCount = 0;
    lastApprovalMessages.delete(channelId);

    await new Promise(r => setTimeout(r, 3000));

    const poll = async () => {
        try {
            // Stop polling if the monitor was cancelled (e.g. channel deletion)
            if (!activeMonitors.get(channelId)) return;

            const approval = await checkApprovalRequired(cdp);
            if (approval) {
                const currentLastMsg = lastApprovalMessages.get(channelId);
                if (currentLastMsg === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                await new Promise(r => setTimeout(r, 3000));

                if (!activeMonitors.get(channelId)) return;
                const stillRequiresApproval = await checkApprovalRequired(cdp);
                if (!stillRequiresApproval) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                if (currentLastMsg === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                lastApprovalMessages.set(channelId, approval.message);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('approve_action').setLabel('✅ Approve / Run').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('reject_action').setLabel('❌ Reject / Cancel').setStyle(ButtonStyle.Danger)
                );

                const reply = await originalMessage.reply({
                    content: `⚠️ **Approval Required**\n\`\`\`\n${approval.message}\n\`\`\``,
                    components: [row]
                });

                logInteraction('APPROVAL', `Request sent to Discord (${channelId}): ${approval.message.substring(0, 50)}...`);

                try {
                    const interaction = await reply.awaitMessageComponent({
                        filter: i => i.user.id === originalMessage.author.id,
                        time: 60000
                    });

                    const allow = interaction.customId === 'approve_action';
                    await interaction.deferUpdate();

                    await clickApproval(cdp, allow);
                    await reply.edit({
                        content: `${reply.content}\n\n${allow ? '✅ **Approved**' : '❌ **Rejected**'}`,
                        components: []
                    });
                    logInteraction('ACTION', `User ${allow ? 'Approved' : 'Rejected'} the request in ${channelId}.`);

                    for (let j = 0; j < 15; j++) {
                        if (!activeMonitors.get(channelId) || !(await checkApprovalRequired(cdp))) break;
                        await new Promise(r => setTimeout(r, 500));
                    }

                    lastApprovalMessages.delete(channelId);
                    setTimeout(poll, POLLING_INTERVAL);
                } catch (e) {
                    console.error('[INTERACTION_ERROR]', e.message);
                    await reply.edit({ content: '⚠️ Approval timed out.', components: [] });
                    lastApprovalMessages.delete(channelId);
                    setTimeout(poll, POLLING_INTERVAL);
                }
                return;
            }

            console.log(`[POLL - ${channelId}] Checking isGenerating...`);
            const generating = await checkIsGenerating(cdp);
            console.log(`[POLL - ${channelId}] isGenerating result: ${generating}, stableCount: ${stableCount}`);

            if (!generating) {
                stableCount++;
                if (stableCount >= 2) {
                    activeMonitors.delete(channelId);
                    lastApprovalMessages.delete(channelId);

                    console.log(`[POLL - ${channelId}] Getting last response...`);
                    const response = await getLastResponse(cdp);
                    console.log(`[POLL - ${channelId}] Last response obtained:`, response ? "Object found" : "Null");

                    if (response && response.text) {
                        logInteraction('AI_REPLY', `Sending AI response to Discord (${channelId}, ${response.text.length} chars)`);
                        const chunks = response.text.match(/[\s\S]{1,1900}/g) || [response.text];
                        await originalMessage.reply({ content: `🤖 **Antigravity:**\n${chunks[0]}` });
                        for (let i = 1; i < chunks.length; i++) {
                            await originalMessage.channel.send(chunks[i]);
                        }
                    } else {
                        logInteraction('AI_REPLY_ERROR', `Finished generating but no text found in response for ${channelId}.`);
                        await originalMessage.reply({ content: `⚠️ AI completed generation but couldn't read the response text.` });
                    }
                    return;
                }
            } else {
                stableCount = 0;
            }

            setTimeout(poll, POLLING_INTERVAL);
        } catch (e) {
            console.error(`[monitorAIResponse - ${channelId}] Poll error:`, e);
            logInteraction('MONITOR_ERROR', `Poll failed in ${channelId}: ${e.message}`);
            activeMonitors.delete(channelId);
        }
    };

    setTimeout(poll, POLLING_INTERVAL);
}
