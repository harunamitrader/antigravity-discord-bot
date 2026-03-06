// --- DOM操作（Antigravityの制御） ---
import { SELECTORS } from '../selectors.js';
import { logInteraction } from './logging.js';
import {
    sanitizeAssistantMarkdown, sanitizeAssistantResponse, extractNarrativeBody,
    meaningfulBodyScore
} from './text_processing.js';
import { connectCDP, listAllCDPTargets } from './cdp_manager.js';

export async function getLatestUserPrompt(cdp) {
    const EXP = `(() => {
        function getTargetDocs() {
            const docs = [];
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                if (!String(iframes[i].src || '').includes('cascade-panel')) continue;
                try {
                    if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument);
                } catch (e) {}
            }
            if (docs.length === 0) docs.push(document);
            return docs;
        }

        function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function norm(v) {
            return String(v || '').replace(/\\r/g, '').replace(/[ \\t]+$/gm, '').trim();
        }

        function isNoiseLine(line) {
            const t = String(line || '').trim().toLowerCase();
            if (!t) return true;
            if (t === 'send' || t === 'model' || t === 'new') return true;
            if (t.startsWith('ask anything, @ to mention')) return true;
            if (t.startsWith('allow directory access to') || t.startsWith('allow file access to')) return true;
            if (t.startsWith('thought for ') || t === 'analyzed' || t.startsWith('analyzed ')) return true;
            return false;
        }

        const selectors = [
            '[data-message-role="user"]',
            '[data-testid*="user"]',
            '[class*="user-message"]',
            '[class*="message-user"]'
        ];

        const candidates = [];
        for (const doc of getTargetDocs()) {
            const seen = new Set();
            for (const sel of selectors) {
                for (const node of Array.from(doc.querySelectorAll(sel))) {
                    if (!node || seen.has(node)) continue;
                    seen.add(node);
                    if (!isVisible(node)) continue;
                    const txt = norm(node.innerText || node.textContent);
                    if (!txt || txt.length < 5 || txt.length > 600) continue;
                    if (isNoiseLine(txt)) continue;
                    candidates.push(txt);
                }
            }
        }

        if (candidates.length === 0) {
            const fallback = [];
            for (const doc of getTargetDocs()) {
                const bodyText = norm(doc?.body?.innerText || '');
                if (!bodyText) continue;
                const lines = bodyText.split('\\n').map(s => s.trim()).filter(Boolean);
                for (const line of lines) {
                    if (line.length < 8 || line.length > 300) continue;
                    if (isNoiseLine(line)) continue;
                    if (/(please|create|build|make)/i.test(line)) {
                        fallback.push(line);
                    }
                }
            }
            if (fallback.length > 0) return String(fallback[fallback.length - 1] || '');
            return '';
        }
        return String(candidates[candidates.length - 1] || '');
    })()`;

    let best = '';
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call('Runtime.evaluate', { expression: EXP, returnByValue: true, contextId: ctx.id });
            const value = String(res?.result?.value || '').trim();
            if (!value) continue;
            if (value.length >= best.length) best = value;
        } catch (e) { }
    }
    return best;
}

export function scoreExtractedResponseCandidate(candidate) {
    const response = candidate?.response || {};
    const markdown = sanitizeAssistantMarkdown(response.markdown || response.text || '', '');
    const plain = sanitizeAssistantResponse(response.text || '', '');
    const narrative = extractNarrativeBody(markdown || plain);
    const responseScore = Math.max(
        meaningfulBodyScore(narrative),
        meaningfulBodyScore(markdown),
        meaningfulBodyScore(plain)
    );

    const title = String(candidate?.target?.title || '').toLowerCase();
    const url = String(candidate?.target?.url || '').toLowerCase();
    let targetScore = 0;
    if (title.startsWith('launchpad') || url.includes('workbench-jetski-agent')) targetScore += 350;
    if (title.includes('workspace') || title.includes('project')) targetScore += 120;

    return responseScore + targetScore;
}

export async function getLastResponseAcrossTargets() {
    const targets = await listAllCDPTargets();
    if (!Array.isArray(targets) || targets.length === 0) return null;

    const uniq = [];
    const seen = new Set();
    for (const t of targets) {
        const wsUrl = String(t?.webSocketDebuggerUrl || '');
        if (!wsUrl || seen.has(wsUrl)) continue;
        seen.add(wsUrl);
        uniq.push(t);
    }

    const ordered = uniq.sort((a, b) => {
        const at = String(a?.title || '').toLowerCase();
        const bt = String(b?.title || '').toLowerCase();
        const au = String(a?.url || '').toLowerCase();
        const bu = String(b?.url || '').toLowerCase();
        const as = (at.startsWith('launchpad') || au.includes('workbench-jetski-agent')) ? 1 : 0;
        const bs = (bt.startsWith('launchpad') || bu.includes('workbench-jetski-agent')) ? 1 : 0;
        return bs - as;
    });

    const candidates = [];
    for (const target of ordered) {
        const wsUrl = String(target?.webSocketDebuggerUrl || '');
        if (!wsUrl) continue;
        let temp = null;
        try {
            temp = await connectCDP(wsUrl);
            const response = await getLastResponse(temp);
            if (!response?.text) continue;
            try {
                const prompt = await getLatestUserPrompt(temp);
                if (prompt) response.prompt = prompt;
            } catch (e) { }
            const candidate = { target, response };
            const score = scoreExtractedResponseCandidate(candidate);
            logInteraction('ACTION', `[TARGET_SCAN] title="${target.title}" score=${score}`);
            candidates.push({ ...candidate, score });
        } catch (e) {
            logInteraction('ERROR', `[TARGET_SCAN] failed for "${target?.title || wsUrl}": ${e?.message || String(e)}`);
        } finally {
            try { temp?.ws?.close(); } catch (e) { }
        }
    }

    if (candidates.length === 0) return null;

    const launchpad = candidates
        .filter(c => {
            const title = String(c?.target?.title || '').toLowerCase();
            const url = String(c?.target?.url || '').toLowerCase();
            return title.startsWith('launchpad') || url.includes('workbench-jetski-agent');
        })
        .sort((a, b) => b.score - a.score);

    if (launchpad.length > 0) {
        logInteraction('ACTION', `[TARGET_SCAN] selecting Launchpad target: "${launchpad[0].target.title}" score=${launchpad[0].score}`);
        return launchpad[0].response || null;
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return best?.response || null;
}

export async function injectMessage(cdp, text) {
    const safeText = JSON.stringify(text);
    const EXP = `(async () => {
        const SELECTORS = ${JSON.stringify(SELECTORS)};

        function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            if (el.offsetParent === null && style.position !== 'fixed') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function isSubmitButton(btn) {
            if (!btn || btn.disabled || !isVisible(btn)) return false;
            const svg = btn.querySelector('svg');
            if (svg) {
                const cls = (svg.getAttribute('class') || '') + ' ' + (btn.getAttribute('class') || '');
                if (SELECTORS.SUBMIT_BUTTON_SVG_CLASSES.some(c => cls.includes(c))) return true;
            }
            const txt = (btn.innerText || btn.getAttribute('aria-label') || '').trim().toLowerCase();
            return ['send', 'run', 'submit'].includes(txt);
        }

        function getSnapshot(editor) {
            return {
                messageCount: document.querySelectorAll('[data-message-role]').length,
                editorChars: ((editor && editor.innerText) || '').trim().length,
                cancelVisible: Boolean(document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]'))
            };
        }

        async function fillEditor(editor, value) {
            editor.focus();
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const eventInit = { bubbles: true, cancelable: true, key: 'a', code: 'KeyA', keyCode: 65, which: 65 };
            if (isMac) eventInit.metaKey = true;
            else eventInit.ctrlKey = true;
            editor.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            await new Promise(r => setTimeout(r, 50));
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', value);
                dataTransfer.setData('text/html', value.replace(/\\\\n/g, '<br>'));
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer, bubbles: true, cancelable: true
                });
                editor.dispatchEvent(pasteEvent);
            } catch (e) {
                editor.innerText = value;
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function pressEnter(editor) {
            const eventInit = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
            editor.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            editor.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            editor.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        }

        async function trySubmit(editor) {
            const before = getSnapshot(editor);
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            const submit = buttons.find(isSubmitButton);
            let method = 'enter';
            if (submit) { submit.click(); method = 'click'; }
            else { pressEnter(editor); }

            for (let i = 0; i < 8; i++) {
                await new Promise(r => setTimeout(r, 300));
                const after = getSnapshot(editor);
                const submitted = after.cancelVisible || after.messageCount > before.messageCount || (before.editorChars > 0 && after.editorChars === 0);
                if (submitted) return { ok: true, method };
            }

            if (method !== 'enter') {
                pressEnter(editor);
                for (let i = 0; i < 6; i++) {
                    await new Promise(r => setTimeout(r, 300));
                    const after = getSnapshot(editor);
                    const submitted = after.cancelVisible || after.messageCount > before.messageCount || (before.editorChars > 0 && after.editorChars === 0);
                    if (submitted) return { ok: true, method: 'enter' };
                }
            }
            return { ok: false, error: 'submit_not_confirmed' };
        }

        const editors = Array.from(document.querySelectorAll(SELECTORS.CHAT_INPUT)).filter(isVisible);
        const editor = editors.at(-1);
        if (!editor) return { ok: false, error: 'No visible editor found' };
        await fillEditor(editor, ${safeText});
        await new Promise(r => setTimeout(r, 400));
        return await trySubmit(editor);
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value?.ok) {
                logInteraction('INJECT', `Sent: ${text} (${res.result.value.method || 'unknown'} / Context: ${ctx.id})`);
                return res.result.value;
            }
            if (res.result?.value?.error) {
                console.log(`[Injection Fail] Context ${ctx.id}: ${res.result.value.error}`);
            }
        } catch (e) { }
    }

    return { ok: false, error: `Injection failed. Tried ${cdp.contexts.length} contexts.` };
}

export async function checkIsGenerating(cdp) {
    const EXP = `(() => {
        const cancel = document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        return !!(cancel && cancel.offsetParent !== null);
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value === true) return true;
        } catch (e) { }
    }
    return false;
}

export async function waitForGenerationStart(cdp, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (await checkIsGenerating(cdp)) return true;
        } catch (e) { }
        await new Promise(r => setTimeout(r, 400));
    }
    return false;
}

export async function checkApprovalRequired(preferredCdp = null) {
    let targets = [];
    try {
        const res = await fetch(`http://127.0.0.1:9222/json/list`);
        targets = await res.json();
    } catch (e) {
        logInteraction('ERROR', '[CHECK_APPROVAL] failed to fetch targets: ' + e.message);
        if (preferredCdp) targets = [{ webSocketDebuggerUrl: preferredCdp.ws.url, title: 'current' }];
        else return null;
    }

    const EXP = `(() => {
        const SELECTORS = ${JSON.stringify(SELECTORS)};

        function getAllInteractiveElements(root) {
            let els = Array.from(root.querySelectorAll('button, [role="button"], a[role="button"]'));
            const all = root.querySelectorAll('*');
            for (const el of all) {
                if (el.shadowRoot) {
                    els = els.concat(getAllInteractiveElements(el.shadowRoot));
                }
            }
            return els;
        }

        function getButtonText(btn) {
            const span = btn.querySelector('span.truncate');
            if (span) return (span.textContent || '').trim().toLowerCase();
            const raw = (btn.innerText || btn.textContent || '').trim();
            return raw.split('\\n')[0].trim().toLowerCase();
        }

        function isApproveButton(text) {
            if (!text) return false;
            return SELECTORS.APPROVAL_KEYWORDS.some(kw => {
                const lkw = kw.toLowerCase();
                return text === lkw || text.startsWith(lkw + ' ') || text.includes(lkw);
            });
        }

        function isRejectButton(text) {
            if (!text) return false;
            return SELECTORS.CANCEL_KEYWORDS.some(kw => {
                const lkw = kw.toLowerCase();
                return text === lkw || text.startsWith(lkw + ' ') || text.includes(lkw);
            });
        }

        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return null;
        const buttons = getAllInteractiveElements(panel);
        for (const btn of buttons) {
            if (btn.offsetWidth === 0 || btn.offsetHeight === 0) continue;
            if (btn.getAttribute('aria-haspopup') === 'listbox') continue;

            const text = getButtonText(btn);
            if (!text || !isApproveButton(text)) continue;

            let container = btn.parentElement;
            let siblings = [];
            for (let level = 0; level < 4 && container; level++) {
                siblings = getAllInteractiveElements(container)
                    .filter(s => s.offsetWidth > 0 && s.offsetHeight > 0 && s.getAttribute('aria-haspopup') !== 'listbox');
                if (siblings.length > 1) break;
                container = container.parentElement;
            }
            if (!container) continue;

            const approveLabels = [];
            const rejectLabels = [];
            for (const s of siblings) {
                const st = getButtonText(s);
                if (!st) continue;
                const spanEl = s.querySelector('span.truncate');
                const originalText = spanEl ? (spanEl.textContent || '').trim()
                    : (s.innerText || s.textContent || '').trim().split('\\n')[0].trim();
                if (!originalText) continue;
                if (isApproveButton(st) && !approveLabels.includes(originalText)) approveLabels.push(originalText);
                if (isRejectButton(st) && !rejectLabels.includes(originalText)) rejectLabels.push(originalText);
            }
            if (rejectLabels.length === 0) continue;

            let contextText = 'Action requires approval.';
            let ancestor = btn;
            for (let i = 0; i < 5 && ancestor.parentElement; i++) ancestor = ancestor.parentElement;
            if (ancestor) {
                let clean = (ancestor.innerText || '').replace(/[ \\t]+/g, ' ').replace(/\\n{2,}/g, '\\n').trim();
                if (clean.length > 500) clean = clean.substring(0, 500) + '...';
                if (clean) contextText = clean;
            }
            return { required: true, message: contextText, approveLabels, rejectLabels };
        }
        return null;
    })()`;

    for (const t of targets) {
        const url = t.webSocketDebuggerUrl;
        if (!url) continue;
        const isWorkbench = t.title?.toLowerCase().includes('antigravity') || t.url?.includes('workbench');
        if (!isWorkbench && (!preferredCdp || url !== preferredCdp.ws.url)) continue;

        let tempCdp = null;
        try {
            if (preferredCdp && url === preferredCdp.ws.url) {
                tempCdp = preferredCdp;
            } else {
                tempCdp = await connectCDP(url, { silent: true });
            }

            for (const ctx of tempCdp.contexts) {
                const res = await tempCdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
                if (res.result?.value?.required) {
                    const result = res.result.value;
                    result.targetUrl = url;
                    return result;
                }
            }
        } catch (e) {
        } finally {
            if (tempCdp && tempCdp !== preferredCdp) {
                try { tempCdp.ws.close(); } catch (e) { }
            }
        }
    }
    return null;
}

export async function clickApproval(preferredCdp, allow, targetLabel = null, targetUrl = null) {
    const isAllowStr = allow ? 'true' : 'false';
    const safeLabel = targetLabel ? JSON.stringify(targetLabel.toLowerCase()) : 'null';

    let activeCdp = preferredCdp;
    let needsClose = false;

    if (targetUrl && (!preferredCdp || preferredCdp.ws.url !== targetUrl)) {
        try {
            activeCdp = await connectCDP(targetUrl, { silent: true });
            needsClose = true;
        } catch (e) {
            logInteraction('ERROR', '[CLICK_APPROVAL] failed to connect to ' + targetUrl + ': ' + e.message);
            if (!activeCdp) return { success: false };
        }
    }

    if (!activeCdp) return { success: false };

    const EXP = `(() => {
        const SELECTORS = ${JSON.stringify(SELECTORS)};
        const isAllow = ${isAllowStr};
        const targetLabel = ${safeLabel};

        function getAllInteractiveElements(root) {
            let els = Array.from(root.querySelectorAll('button, [role="button"], a[role="button"]'));
            const all = root.querySelectorAll('*');
            for (const el of all) {
                if (el.shadowRoot) {
                    els = els.concat(getAllInteractiveElements(el.shadowRoot));
                }
            }
            return els;
        }

        function getButtonText(btn) {
            const span = btn.querySelector('span.truncate');
            if (span) return (span.textContent || '').trim().toLowerCase();
            const raw = (btn.innerText || btn.textContent || '').trim();
            return raw.split('\\n')[0].trim().toLowerCase();
        }

        function isApproveButton(text) {
            if (!text) return false;
            return SELECTORS.APPROVAL_KEYWORDS.some(kw => {
                const lkw = kw.toLowerCase();
                return text === lkw || text.startsWith(lkw + ' ') || text.includes(lkw);
            });
        }

        function isRejectButton(text) {
            if (!text) return false;
            return SELECTORS.CANCEL_KEYWORDS.some(kw => {
                const lkw = kw.toLowerCase();
                return text === lkw || text.startsWith(lkw + ' ') || text.includes(lkw);
            });
        }

        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { success: false, log: ['panel not found'] };
        const buttons = getAllInteractiveElements(panel);
        for (const btn of buttons) {
            if (btn.offsetWidth === 0 || btn.offsetHeight === 0) continue;
            if (btn.getAttribute('aria-haspopup') === 'listbox') continue;

            const text = getButtonText(btn);
            if (!text) continue;

            let container = btn.parentElement;
            let siblings = [];
            for (let level = 0; level < 4 && container; level++) {
                siblings = getAllInteractiveElements(container)
                    .filter(s => s.offsetWidth > 0 && s.offsetHeight > 0 && s.getAttribute('aria-haspopup') !== 'listbox');
                if (siblings.length > 1) break;
                container = container.parentElement;
            }
            if (!container) continue;

            if (isAllow && isApproveButton(text)) {
                if (targetLabel && text !== targetLabel) continue;
                const hasReject = siblings.some(s => s !== btn && isRejectButton(getButtonText(s)));
                if (!hasReject) continue;
                btn.click();
                return { success: true, log: ['CLICKING APPROVE: ' + text] };
            }

            if (!isAllow && isRejectButton(text)) {
                if (targetLabel && text !== targetLabel) continue;
                const hasApprove = siblings.some(s => s !== btn && isApproveButton(getButtonText(s)));
                if (!hasApprove) continue;
                btn.click();
                return { success: true, log: ['CLICKING REJECT: ' + text] };
            }
        }
        return { success: false, log: [] };
    })()`;

    try {
        for (const ctx of activeCdp.contexts) {
            try {
                const evalPromise = activeCdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
                const res = await Promise.race([evalPromise, timeoutPromise]);
                if (res.result?.value?.success) {
                    logInteraction('CLICK', `Approval / Rejection clicked: ${allow} (success) in ${activeCdp.ws.url}`);
                    return res.result.value;
                }
            } catch (e) { }
        }
    } finally {
        if (needsClose && activeCdp) {
            try { activeCdp.ws.close(); } catch (e) { }
        }
    }
    logInteraction('CLICK', `Approval / Rejection clicked: ${allow} (failed)`);
    return { success: false };
}

export async function getLastResponse(cdp) {
    const RAW_CHAR_LIMIT = 4000;
    const REPLY_CHAR_LIMIT = 1900;

    const EXP = '(' + function (RAW_LIMIT, REPLY_LIMIT) {
        try {
            var msgContainer = document.querySelector('.relative.flex.flex-col.gap-y-3.px-4');
            if (!msgContainer) return { text: '', debug: 'msgContainer not found' };

            var blocks = Array.from(msgContainer.children);
            if (blocks.length === 0) return { text: '', debug: 'no children in msgContainer' };

            var userBlockIdx = -1;
            for (var i = blocks.length - 1; i >= 0; i--) {
                var undo = blocks[i].querySelector('[data-tooltip-id*="undo"], [title*="Undo"]');
                if (undo) { userBlockIdx = i; break; }
            }

            var startIdx = userBlockIdx >= 0 ? userBlockIdx + 1 : 0;
            if (startIdx >= blocks.length && userBlockIdx >= 0) startIdx = userBlockIdx;
            var responseBlocks = blocks.slice(startIdx);
            if (responseBlocks.length === 0) return { text: '', debug: 'no response blocks, userBlockIdx=' + userBlockIdx + ' total=' + blocks.length };

            var cleanedTexts = [];
            for (var bi = 0; bi < responseBlocks.length; bi++) {
                var block = responseBlocks[bi];
                var clone = block.cloneNode(true);

                var allEls = Array.from(clone.querySelectorAll('*'));
                for (var ei = 0; ei < allEls.length; ei++) {
                    var el = allEls[ei];
                    if (!el.parentNode) continue;
                    var elText = (el.innerText || '').trim();
                    if (!elText) continue;
                    var isThought = (/^Thought for/.test(elText) && elText.length < 30) || elText === 'Thought Process';
                    var logHeaders = ['Ran command', 'Ran background command', 'Ran terminal command', 'Analyzed', 'Running command', 'Always run', 'Exit code', 'Error during'];
                    var isLog = false;
                    for (var li = 0; li < logHeaders.length; li++) {
                        if (elText.indexOf(logHeaders[li]) === 0 && elText.length < 30) { isLog = true; break; }
                    }
                    if (isThought || isLog) {
                        var container = el.closest('details') || el.closest('.border') || el.closest('.bg-ide-bg') || el.closest('.rounded') || el.parentElement;
                        if (container && container.parentNode) {
                            container.parentNode.replaceChild(document.createTextNode(' '), container);
                        }
                    }
                }

                var styles = Array.from(clone.querySelectorAll('style'));
                for (var si = 0; si < styles.length; si++) {
                    if (styles[si].parentNode) styles[si].parentNode.removeChild(styles[si]);
                }

                var btns = Array.from(clone.querySelectorAll('button'));
                for (var bti = 0; bti < btns.length; bti++) {
                    var btnText = (btns[bti].innerText || '').trim();
                    if (btnText === 'Good' || btnText === 'Bad') {
                        var wrap = btns[bti].closest('.flex');
                        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
                        else if (btns[bti].parentNode) btns[bti].parentNode.removeChild(btns[bti]);
                    }
                }

                clone.style.cssText = 'position:absolute;left:-9999px;top:0;opacity:0;pointer-events:none;width:800px';
                document.body.appendChild(clone);

                var undos = Array.from(clone.querySelectorAll('[data-tooltip-id*="undo"], [title*="Undo"]'));
                for (var ui = 0; ui < undos.length; ui++) {
                    var cur = undos[ui];
                    var target = cur.closest('.whitespace-pre-wrap') || cur.parentElement;
                    var ancestor = cur.parentElement;
                    while (ancestor && ancestor !== clone) {
                        try {
                            var bg = window.getComputedStyle(ancestor).backgroundColor;
                            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                                target = ancestor;
                                break;
                            }
                        } catch (e) { }
                        ancestor = ancestor.parentElement;
                    }
                    if (target && target.parentNode) target.parentNode.replaceChild(document.createTextNode(' '), target);
                }

                var text = clone.innerText;
                document.body.removeChild(clone);

                text = text.replace(/Good\s*Bad\s*$/g, '').replace(/\n{3,}/g, '\n\n').trim();
                if (text) cleanedTexts.push(text);
            }

            if (cleanedTexts.length === 0) return { text: '', debug: 'cleanedTexts empty, responseBlocks=' + responseBlocks.length };

            var rawResponse = cleanedTexts.join('\n\n');
            if (rawResponse.length > RAW_LIMIT) rawResponse = rawResponse.slice(-RAW_LIMIT);

            var replyText = rawResponse;
            if (replyText.length > REPLY_LIMIT) replyText = replyText.slice(-REPLY_LIMIT);

            return { text: replyText, rawLength: rawResponse.length };
        } catch (e) {
            return { text: '', debug: 'Exception: ' + String(e.message || e) };
        }
    } + ')(' + RAW_CHAR_LIMIT + ',' + REPLY_CHAR_LIMIT + ')';

    for (const ctx of cdp.contexts) {
        try {
            const res = await Promise.race([
                cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id }),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))
            ]);
            if (res.exceptionDetails) {
                logInteraction('ERROR', `getLastResponse CDP exception in ctx ${ctx.id}: ${JSON.stringify(res.exceptionDetails.text || res.exceptionDetails)}`);
                continue;
            }
            const v = res.result?.value;
            if (!v) continue;
            if (v.debug) {
                logInteraction('ERROR', `getLastResponse debug info (ctx ${ctx.id}): ${v.debug}`);
            }
            if (!String(v.text || '').trim()) continue;
            return {
                text: String(v.text).trim(),
                rawLength: v.rawLength || 0,
                contextId: ctx.id
            };
        } catch (e) {
            logInteraction('ERROR', `getLastResponse context ${ctx.id} failed: ${e.message}`);
        }
    }
    return null;
}

export async function getScreenshot(cdp) {
    try {
        const result = await cdp.call("Page.captureScreenshot", { format: "png" });
        return Buffer.from(result.data, 'base64');
    } catch (e) { return null; }
}

export async function stopGeneration(cdp) {
    const EXP = `(() => {
                function getTargetDoc() {
                    const iframes = document.querySelectorAll('iframe');
                    for (let i = 0; i < iframes.length; i++) {
                        if (iframes[i].src.includes('cascade-panel')) {
                            try { return iframes[i].contentDocument; } catch (e) { }
                        }
                    }
                    return document;
                }
                const doc = getTargetDoc();
                const cancel = doc.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
                if (cancel && cancel.offsetParent !== null) {
                    cancel.click();
                    return { success: true };
                }
                const buttons = doc.querySelectorAll('button');
                for (const btn of buttons) {
                    const txt = (btn.innerText || '').trim().toLowerCase();
                    btn.click();
                    return { success: true };
                }
            return { success: false, reason: 'Cancel button not found' };
            }) ()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value?.success) {
                logInteraction('STOP', 'Generation stopped by user.');
                return true;
            }
        } catch (e) { }
    }
    return false;
}

function summarizeNewChatAttempt(a) {
    const parts = [
        `ctx = ${a.contextId ?? 'n/a'} `,
        `phase = ${a.phase ?? 'n/a'} `,
        `success = ${Boolean(a.success)} `,
        `reason = ${a.reason || 'n/a'} `,
        `doc = ${a.docSource || 'n/a'} `,
        `selector = ${a.method || a.selector || 'n/a'} `
    ];
    if (typeof a.changed === 'boolean') parts.push(`changed = ${a.changed} `);
    if (a.confirmClicked) parts.push(`confirm = "${a.confirmClicked}"`);
    return parts.join(', ');
}

export async function startNewChat(cdp) {
    const EXP = `(async () => {
            function getTargetDoc() {
                const iframes = document.querySelectorAll('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    if ((iframes[i].src || '').includes('cascade-panel')) {
                        try { return iframes[i].contentDocument; } catch (e) { }
                    }
                }
                return null;
            }

            function isVisible(el) {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
                if (el.offsetParent === null && style.position !== 'fixed') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }

            function getSnapshot(doc) {
                const editorCandidates = Array.from(doc.querySelectorAll('div[role="textbox"]:not(.xterm-helper-textarea)')).filter(isVisible);
                const editor = editorCandidates.at(-1);
                const titles = Array.from(doc.querySelectorAll('p.text-ide-sidebar-title-color')).map(el => (el.innerText || '').trim()).filter(Boolean);
                return {
                    messageCount: doc.querySelectorAll('[data-message-role]').length,
                    activeTitle: titles[0] || null,
                    editorChars: ((editor && editor.innerText) || '').trim().length
                };
            }

            const selectors = [
                '[data-tooltip-id="new-conversation-tooltip"]',
                '[data-tooltip-id*="new-chat"]',
                '[data-tooltip-id*="new_chat"]',
                '[aria-label*="New Chat"]',
                '[aria-label*="New Conversation"]'
            ];

            const docs = [{ source: 'document', doc: document }];
            const iframeDoc = getTargetDoc();
            if (iframeDoc) docs.push({ source: 'cascade_iframe', doc: iframeDoc });

            for (const item of docs) {
                const doc = item.doc;
                for (const sel of selectors) {
                    const btn = doc.querySelector(sel);
                    if (!btn) continue;
                    if (!isVisible(btn) || btn.disabled) {
                        return { success: false, reason: 'button_not_interactable', selector: sel, docSource: item.source };
                    }

                    const before = getSnapshot(doc);
                    const dispatch = (type, Cls) => {
                        try {
                            if (typeof Cls === 'function') {
                                btn.dispatchEvent(new Cls(type, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
                            }
                        } catch (e) { }
                    };

                    dispatch('pointerdown', PointerEvent);
                    dispatch('mousedown', MouseEvent);
                    dispatch('pointerup', PointerEvent);
                    dispatch('mouseup', MouseEvent);
                    dispatch('click', MouseEvent);
                    try { btn.click(); } catch (e) { }
                    await new Promise(r => setTimeout(r, 700));

                    const confirmKeywords = ['start new', 'new chat', 'new conversation', 'discard', 'continue', 'ok', 'yes'];
                    let confirmClicked = null;
                    const modalButtons = Array.from(doc.querySelectorAll('button, [role="button"]')).filter(isVisible);
                    for (const b of modalButtons) {
                        const txt = ((b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase());
                        if (!txt) continue;
                        if (confirmKeywords.some(k => txt.includes(k))) {
                            try {
                                b.click();
                                confirmClicked = txt.slice(0, 80);
                                break;
                            } catch (e) { }
                        }
                    }

                    await new Promise(r => setTimeout(r, 1100));
                    const after = getSnapshot(doc);

                    const changed =
                        before.activeTitle !== after.activeTitle ||
                        (before.messageCount > 0 && after.messageCount === 0) ||
                        (before.editorChars > 0 && after.editorChars === 0);

                    const alreadyFresh = before.messageCount === 0 && before.editorChars === 0;
                    const success = changed || Boolean(confirmClicked) || alreadyFresh;

                    return {
                        success,
                        reason: success ? 'ok' : 'click_no_state_change',
                        method: sel,
                        selector: sel,
                        docSource: item.source,
                        changed,
                        confirmClicked,
                        before,
                        after
                    };
                }
            }

            return { success: false, reason: 'button_not_found' };
        })()`;

    const attempts = [];
    const primary = cdp.contexts.filter(c =>
        (c.url && c.url.includes(SELECTORS.CONTEXT_URL_KEYWORD)) ||
        (c.name && c.name.includes('Extension'))
    );
    const firstPass = primary.length > 0 ? primary : cdp.contexts;
    const secondPass = primary.length > 0 ? cdp.contexts.filter(c => !primary.includes(c)) : [];

    const tryContexts = async (contexts, phase) => {
        for (const ctx of contexts) {
            try {
                const res = await cdp.call('Runtime.evaluate', { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
                const value = res.result?.value || { success: false, reason: 'empty_result' };
                const attempt = {
                    ...value,
                    phase,
                    contextId: ctx.id,
                    contextName: ctx.name || '',
                    contextUrl: ctx.url || ''
                };
                attempts.push(attempt);
                console.log(`[NEWCHAT] ${summarizeNewChatAttempt(attempt)} `);
                if (attempt.success) {
                    logInteraction('NEWCHAT', `Success: ${summarizeNewChatAttempt(attempt)} `);
                    return attempt;
                }
            } catch (e) {
                const attempt = {
                    success: false,
                    reason: `evaluate_error:${e.message} `,
                    phase,
                    contextId: ctx.id,
                    contextName: ctx.name || '',
                    contextUrl: ctx.url || ''
                };
                attempts.push(attempt);
                console.log(`[NEWCHAT] ${summarizeNewChatAttempt(attempt)} `);
            }
        }
        return null;
    };

    const result1 = await tryContexts(firstPass, 'primary');
    if (result1) return result1;
    const result2 = await tryContexts(secondPass, 'fallback');
    if (result2) return result2;

    const tail = attempts.slice(-3).map(summarizeNewChatAttempt).join(' | ');
    logInteraction('NEWCHAT', `Failed after ${attempts.length} attempts.Recent: ${tail} `);
    return {
        success: false,
        reason: attempts[attempts.length - 1]?.reason || 'unknown',
        attempts
    };
}

export async function getCurrentModel(cdp) {
    const EXP = `(() => {
        const panels = document.querySelectorAll('.antigravity-agent-side-panel');
        for (const panel of panels) {
            const span = panel.querySelector('span.min-w-0.select-none.overflow-hidden.text-ellipsis.whitespace-nowrap.text-xs.opacity-70');
            if (span) {
                const txt = span.innerText.trim();
                if (txt && !txt.includes('Planning') && !txt.includes('Fast')) return txt;
            }
        }
        return null;
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) { }
    }
    return null;
}

export async function getCurrentTitle(cdp) {
    const EXP = `(() => {
            const docs = [document];
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch (e) { }
            }
            for (const doc of docs) {
                const panels = doc.querySelectorAll('.antigravity-agent-side-panel');
                for (const panel of panels) {
                    const titleDiv = panel.querySelector('div.flex.min-w-0.items-center.overflow-hidden.text-ellipsis.whitespace-nowrap.gap-1');
                    if (titleDiv) {
                        const txt = (titleDiv.innerText || '').trim();
                        if (txt.length > 1) return txt;
                    }
                }
            }
            return null;
        })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) { }
    }
    return null;
}

export async function getModelList(cdp) {
    const EXP = `(async () => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return JSON.stringify({ models: [], error: 'panel not found' });

        // aria-haspopup="dialog" を持つボタンからモデル名を含むものを探す
        const buttons = Array.from(panel.querySelectorAll('div[role="button"][aria-haspopup="dialog"], button[aria-haspopup="dialog"]'));
        let targetBtn = null;
        for (const btn of buttons) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (txt.includes('claude') || txt.includes('gemini') || txt.includes('gpt') || txt.includes('o1') || txt.includes('o3') || txt.includes('o4')) {
                targetBtn = btn;
                break;
            }
        }
        if (!targetBtn) return JSON.stringify({ models: [], error: 'model button not found' });

        // ドロップダウンを開く
        targetBtn.click();
        await new Promise(r => setTimeout(r, 800));

        // dialog内のモデル候補を取得
        const models = [];
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        for (const dialog of dialogs) {
            const spans = dialog.querySelectorAll('span.text-xs.font-medium');
            for (const span of spans) {
                const name = span.innerText.trim();
                if (name && name.length > 2 && !models.includes(name)) {
                    models.push(name);
                }
            }
        }

        // ドロップダウンを閉じる（同じボタンをクリック）
        targetBtn.click();
        await new Promise(r => setTimeout(r, 300));

        // まだ開いている場合はEscキーで閉じる
        const stillOpen = document.querySelector('div[role="dialog"]:not([style*="visibility: hidden"])');
        if (stillOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            await new Promise(r => setTimeout(r, 300));
        }

        return JSON.stringify({ models });
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value) {
                const result = JSON.parse(res.result.value);
                if (result.models && result.models.length > 0) return result.models;
            }
        } catch (e) { }
    }
    return [];
}

export async function switchModel(cdp, targetName) {
    const SWITCH_EXP = `(async () => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return JSON.stringify({ success: false, reason: 'panel not found' });

        const buttons = Array.from(panel.querySelectorAll('div[role="button"][aria-haspopup="dialog"], button[aria-haspopup="dialog"]'));
        let targetBtn = null;
        for (const btn of buttons) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (txt.includes('claude') || txt.includes('gemini') || txt.includes('gpt') || txt.includes('o1') || txt.includes('o3') || txt.includes('o4')) {
                targetBtn = btn;
                break;
            }
        }
        if (!targetBtn) return JSON.stringify({ success: false, reason: 'model button not found' });

        // ドロップダウンを開く
        targetBtn.click();
        await new Promise(r => setTimeout(r, 800));

        // 対象モデルをクリック
        const target = ${JSON.stringify(targetName)}.toLowerCase();
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        for (const dialog of dialogs) {
            const spans = dialog.querySelectorAll('span.text-xs.font-medium');
            for (const span of spans) {
                const txt = span.innerText.trim();
                if (txt.toLowerCase().includes(target)) {
                    // span の親要素をクリック（cursor-pointer を持つ要素）
                    const clickTarget = span.closest('.cursor-pointer') || span.closest('[role="option"]') || span.parentElement;
                    if (clickTarget) clickTarget.click();
                    else span.click();
                    return JSON.stringify({ success: true, model: txt });
                }
            }
        }

        // モデルが見つからない場合はドロップダウンを閉じる
        targetBtn.click();
        await new Promise(r => setTimeout(r, 300));
        const stillOpen = document.querySelector('div[role="dialog"]:not([style*="visibility: hidden"])');
        if (stillOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        return JSON.stringify({ success: false, reason: 'model not found in list' });
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: SWITCH_EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value) {
                const result = JSON.parse(res.result.value);
                if (result.success) {
                    logInteraction('MODEL', `Switched to: ${result.model}`);
                    return result;
                }
            }
        } catch (e) { }
    }
    return { success: false, reason: 'CDP error' };
}

export async function getCurrentMode(cdp) {
    const EXP = `(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return null;
        // "Planning" or "Fast" のテキストを持つspanを探す
        const spans = panel.querySelectorAll('span.text-xs.select-none');
        for (const s of spans) {
            const txt = (s.innerText || '').trim();
            if (txt === 'Planning' || txt === 'Fast') return txt;
        }
        return null;
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) { }
    }
    return null;
}

export async function switchMode(cdp, targetMode) {
    const SWITCH_EXP = `(async () => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return JSON.stringify({ success: false, reason: 'panel not found' });

        // "Planning" or "Fast" テキストを持つ aria-haspopup="dialog" ボタンを探す
        const buttons = Array.from(panel.querySelectorAll('div[role="button"][aria-haspopup="dialog"], button[aria-haspopup="dialog"]'));
        let targetBtn = null;
        for (const btn of buttons) {
            const txt = (btn.textContent || '').trim();
            if (txt === 'Planning' || txt === 'Fast') {
                targetBtn = btn;
                break;
            }
        }
        if (!targetBtn) return JSON.stringify({ success: false, reason: 'mode button not found' });

        // ドロップダウンを開く
        targetBtn.click();
        await new Promise(r => setTimeout(r, 800));

        // dialog内から対象モードを探してクリック
        const targetStr = ${JSON.stringify(targetMode)}.toLowerCase() === 'fast' ? 'Fast' : 'Planning';
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        for (const dialog of dialogs) {
            const divs = dialog.querySelectorAll('div.font-medium');
            for (const d of divs) {
                if (d.innerText.trim() === targetStr) {
                    d.click();
                    return JSON.stringify({ success: true, mode: d.innerText.trim() });
                }
            }
        }

        // 見つからない場合はドロップダウンを閉じる
        targetBtn.click();
        await new Promise(r => setTimeout(r, 300));
        const stillOpen = document.querySelector('div[role="dialog"]:not([style*="visibility: hidden"])');
        if (stillOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        return JSON.stringify({ success: false, reason: 'mode option not found' });
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: SWITCH_EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value) {
                const result = JSON.parse(res.result.value);
                if (result.success) {
                    logInteraction('MODE', `Switched to: ${result.mode}`);
                    return result;
                }
            }
        } catch (e) { }
    }
    return { success: false, reason: 'CDP error' };
}
