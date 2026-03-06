// --- AI応答モニターループ ---
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SELECTORS } from '../selectors.js';
import { POLLING_INTERVAL } from './config.js';
import { state } from './state.js';
import { logInteraction } from './logging.js';
import { safeReplyTarget, sendResponseEmbeds } from './discord_helpers.js';
import { checkApprovalRequired, clickApproval, checkIsGenerating, getLastResponse } from './dom_operations.js';

export async function monitorAIResponse(originalMessage, cdp) {
    if (state.isGenerating) return;
    state.isGenerating = true;
    let stableCount = 0;
    let generationStarted = false;
    state.lastApprovalMessage = null;
    logInteraction('ACTION', 'Monitoring AI response.');

    await new Promise(r => setTimeout(r, 3000));

    const startTime = Date.now();
    const MONITOR_TIMEOUT = 30 * 60 * 1000; // 30分

    const poll = async () => {
        try {
            if (Date.now() - startTime > MONITOR_TIMEOUT) {
                logInteraction('ERROR', 'AI response monitoring timed out after 30 minutes.');
                try {
                    await safeReplyTarget(
                        originalMessage,
                        { content: 'AI response monitoring timed out (30 minutes). The generation might still be in progress, but the bot has stopped waiting. Please check the session or retry with `!lr` later.' },
                        { preferReply: true }
                    );
                } catch (replyErr) {
                    logInteraction('ERROR', `Failed to send timeout notification to Discord: ${replyErr?.message || String(replyErr)}`);
                }
                state.isGenerating = false;
                return;
            }

            const approval = await checkApprovalRequired(cdp);
            if (approval) {
                const targetUrl = approval.targetUrl;

                if (state.lastApprovalMessage === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                // 3秒待って一時的なボタンでないことを確認
                await new Promise(r => setTimeout(r, 3000));

                const stillRequiresApproval = await checkApprovalRequired(cdp);
                if (!stillRequiresApproval) {
                    console.log("Approval button disappeared during grace period. Skipping Discord notification.");
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                if (state.autoApproveMode) {
                    // Smart Safety: 破壊的コマンドが含まれる場合は自動承認をスキップ
                    const msgLower = approval.message.toLowerCase();
                    const dangerousMatch = SELECTORS.DANGEROUS_COMMANDS.find(cmd => msgLower.includes(cmd.toLowerCase()));
                    if (dangerousMatch) {
                        console.log(`[SAFETY] Dangerous command detected: "${dangerousMatch}" — Forcing manual approval via Discord.`);
                    } else {
                        const autoApprovalResult = await clickApproval(cdp, true, null, targetUrl);
                        if (autoApprovalResult?.success) {
                            logInteraction('APPROVAL', `Auto-approved request: ${approval.message.substring(0, 50)}...`);
                            state.lastApprovalMessage = null;
                            setTimeout(poll, POLLING_INTERVAL);
                            return;
                        }
                    }
                }

                if (state.lastApprovalMessage === approval.message) {
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                state.lastApprovalMessage = approval.message;

                // Antigravity側のボタンラベルをそのままDiscordボタンに反映
                const approveLabels = approval.approveLabels || ['Approve'];
                const rejectLabels = approval.rejectLabels || ['Reject'];
                const allButtons = [];

                for (const label of rejectLabels) {
                    allButtons.push(
                        new ButtonBuilder()
                            .setCustomId('reject_' + label.toLowerCase().replace(/\s+/g, '_'))
                            .setLabel(label)
                            .setStyle(ButtonStyle.Danger)
                    );
                }
                for (const label of approveLabels) {
                    allButtons.push(
                        new ButtonBuilder()
                            .setCustomId('approve_' + label.toLowerCase().replace(/\s+/g, '_'))
                            .setLabel(label)
                            .setStyle(ButtonStyle.Success)
                    );
                }

                const row = new ActionRowBuilder().addComponents(...allButtons);
                logInteraction('APPROVAL', `Request sent to Discord: ${approval.message.substring(0, 50)}...`);

                let reply;
                try {
                    reply = await originalMessage.reply({
                        content: `**Action Required:**\n${approval.message}`,
                        components: [row]
                    });
                } catch (replyErr) {
                    console.error('[DISCORD_REPLY_ERROR]', replyErr.message);
                    state.lastApprovalMessage = null;
                    setTimeout(poll, POLLING_INTERVAL);
                    return;
                }

                try {
                    const interaction = await reply.awaitMessageComponent({ filter: i => i.user.id === (originalMessage.author?.id || originalMessage.user?.id), time: 60000 });
                    const allow = interaction.customId.startsWith('approve_');
                    const clickedLabel = interaction.component.label;
                    await interaction.deferUpdate();
                    const clickResult = await clickApproval(cdp, allow, clickedLabel, targetUrl);
                    logInteraction('ACTION', `User clicked "${clickedLabel}" (${allow ? 'Approve' : 'Reject'}).`);

                    await reply.edit({
                        content: `**${clickedLabel}:**\n${approval.message}`,
                        components: []
                    });

                    for (let j = 0; j < 15; j++) {
                        if (!(await checkApprovalRequired(cdp))) break;
                        await new Promise(r => setTimeout(r, 500));
                    }

                    state.lastApprovalMessage = null;
                    setTimeout(poll, POLLING_INTERVAL);
                } catch (e) {
                    console.error('[INTERACTION_ERROR]', e.message, e.stack);
                    state.lastApprovalMessage = null;
                    try { await reply.edit({ components: [] }); } catch (err) { }
                    setTimeout(poll, POLLING_INTERVAL);
                }
                return;
            }

            const generating = await checkIsGenerating(cdp);
            if (generating && !generationStarted) {
                generationStarted = true;
                logInteraction('generating', 'AI response generation started.');
            }
            if (!generating) {
                stableCount++;
                if (stableCount >= 3) {
                    state.isGenerating = false;
                    logInteraction('SUCCESS', 'AI response generation completed.');
                    let response = null;
                    try {
                        response = await getLastResponse(cdp);
                    } catch (e) {
                        logInteraction('ERROR', `getLastResponse failed: ${e?.message || String(e)}`);
                    }
                    if (!response?.text) {
                        logInteraction('ERROR', 'AI response generation completed, but extraction returned empty text.');
                        try {
                            await safeReplyTarget(
                                originalMessage,
                                { content: 'AI response generation completed, but extracting the final response failed. Please retry.' },
                                { preferReply: true }
                            );
                        } catch (replyErr) {
                            logInteraction('ERROR', `Failed to send extraction error to Discord: ${replyErr?.message || String(replyErr)}`);
                        }
                        return;
                    }

                    logInteraction(
                        'ACTION',
                        `Extracted AI response (${response.text.length} chars, rawLength=${response.rawLength || 0}, ctx=${response.contextId ?? 'n/a'})`
                    );

                    let sent = false;
                    try {
                        sent = await sendResponseEmbeds(originalMessage, response, originalMessage.content || '');
                    } catch (sendErr) {
                        logInteraction('ERROR', `sendResponseEmbeds failed: ${sendErr?.message || String(sendErr)}`);
                    }
                    if (!sent) {
                        logInteraction('ERROR', 'AI response was extracted, but local dump handling failed.');
                        try {
                            await safeReplyTarget(
                                originalMessage,
                                { content: 'AI response was extracted, but local dump handling failed.' },
                                { preferReply: true }
                            );
                        } catch (fallbackErr) {
                            logInteraction('ERROR', `Fallback failure message send failed: ${fallbackErr?.message || String(fallbackErr)}`);
                        }
                    }
                    return;
                }
            } else {
                stableCount = 0;
            }

            setTimeout(poll, POLLING_INTERVAL);
        } catch (e) {
            console.error("Poll error:", e);
            logInteraction('ERROR', `Poll error: ${e?.stack || e?.message || String(e)}`);
            state.isGenerating = false;
        }
    };

    setTimeout(poll, POLLING_INTERVAL);
}
