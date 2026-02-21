import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logInteraction } from '../utils/logger.js';
import { checkApprovalRequired, clickApproval } from '../cdp/approval.js';
import { checkIsGenerating, getLastResponse } from '../cdp/operations.js';

const POLLING_INTERVAL = 2000;

let isGenerating = false;
let lastApprovalMessage = null;

export function getIsGenerating() {
    return isGenerating;
}

export function setIsGenerating(value) {
    isGenerating = value;
}

export async function monitorAIResponse(originalMessage, cdp) {
    if (isGenerating) {
        logInteraction('MONITOR', 'Ignored monitor request because already generating');
        return;
    }
    isGenerating = true;
    logInteraction('MONITOR', 'Started AI response monitoring');
    let stableCount = 0;
    lastApprovalMessage = null;

    await new Promise(r => setTimeout(r, 3000));

    const poll = async () => {
        try {
            // console.log("[POLL] Checking approval...");
            const approval = await checkApprovalRequired(cdp);
            if (approval) {
                // ... (既存の処理そのままにログだけ追加)
                if (lastApprovalMessage === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                await new Promise(r => setTimeout(r, 3000));
                const stillRequiresApproval = await checkApprovalRequired(cdp);
                if (!stillRequiresApproval) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                if (lastApprovalMessage === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                lastApprovalMessage = approval.message;

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('approve_action').setLabel('✅ Approve / Run').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('reject_action').setLabel('❌ Reject / Cancel').setStyle(ButtonStyle.Danger)
                );

                const reply = await originalMessage.reply({
                    content: `⚠️ **Approval Required**\n\`\`\`\n${approval.message}\n\`\`\``,
                    components: [row]
                });

                logInteraction('APPROVAL', `Request sent to Discord: ${approval.message.substring(0, 50)}...`);

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
                    logInteraction('ACTION', `User ${allow ? 'Approved' : 'Rejected'} the request.`);

                    for (let j = 0; j < 15; j++) {
                        if (!(await checkApprovalRequired(cdp))) break;
                        await new Promise(r => setTimeout(r, 500));
                    }

                    lastApprovalMessage = null;
                    setTimeout(poll, POLLING_INTERVAL);
                } catch (e) {
                    console.error('[INTERACTION_ERROR]', e.message);
                    await reply.edit({ content: '⚠️ Approval timed out.', components: [] });
                    lastApprovalMessage = null;
                    setTimeout(poll, POLLING_INTERVAL);
                }
                return;
            }

            console.log("[POLL] Checking isGenerating...");
            const generating = await checkIsGenerating(cdp);
            console.log(`[POLL] isGenerating result: ${generating}, stableCount: ${stableCount}`);
            if (!generating) {
                stableCount++;
                if (stableCount >= 2) {
                    isGenerating = false;
                    console.log("[POLL] Getting last response...");
                    const response = await getLastResponse(cdp);
                    console.log("[POLL] Last response obtained:", response ? "Object found" : "Null");
                    if (response && response.text) {
                        logInteraction('AI_REPLY', `Sending AI response to Discord (${response.text.length} chars)`);
                        const chunks = response.text.match(/[\s\S]{1,1900}/g) || [response.text];
                        await originalMessage.reply({ content: `🤖 **Antigravity:**\n${chunks[0]}` });
                        for (let i = 1; i < chunks.length; i++) {
                            await originalMessage.channel.send(chunks[i]);
                        }
                    } else {
                        logInteraction('AI_REPLY_ERROR', 'Finished generating but no text found in response.');
                        await originalMessage.reply({ content: `⚠️ AI completed generation but couldn't read the response text. (Could be an empty response or selector issue)` });
                    }
                    return;
                }
            } else {
                stableCount = 0;
            }

            setTimeout(poll, POLLING_INTERVAL);
        } catch (e) {
            console.error("[monitorAIResponse] Poll error:", e);
            logInteraction('MONITOR_ERROR', `Poll failed: ${e.message}`);
            isGenerating = false;
        }
    };

    setTimeout(poll, POLLING_INTERVAL);
}
