import { SELECTORS } from './selectors.js';
import { logInteraction } from '../utils/logger.js';

export async function injectMessage(cdp, text) {
    const safeText = JSON.stringify(text);
    const EXP = `(async () => {
        const SELECTORS = ${JSON.stringify(SELECTORS)};
        
        function isSubmitButton(btn) {
            if (btn.disabled || btn.offsetWidth === 0) return false;
            const svg = btn.querySelector('svg');
            if (svg) {
                const cls = (svg.getAttribute('class') || '') + ' ' + (btn.getAttribute('class') || '');
                if (SELECTORS.SUBMIT_BUTTON_SVG_CLASSES.some(c => cls.includes(c))) return true;
            }
            const txt = (btn.innerText || '').trim().toLowerCase();
            if (['send', 'run'].includes(txt)) return true;
            return false;
        }

        const doc = document;
        const editors = Array.from(doc.querySelectorAll(SELECTORS.CHAT_INPUT));
        const validEditors = editors.filter(el => el.offsetParent !== null);
        const editor = validEditors.at(-1); 
        if (!editor) return { ok: false, error: "No editor found in this context" };

        editor.focus();
        let inserted = doc.execCommand("insertText", false, ${safeText});
        if (!inserted) {
            editor.textContent = ${safeText};
            editor.dispatchEvent(new InputEvent("beforeinput", { bubbles:true, inputType:"insertText", data: ${safeText} }));
            editor.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data: ${safeText} }));
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 200));

        const allButtons = Array.from(doc.querySelectorAll(SELECTORS.SUBMIT_BUTTON_CONTAINER));
        const submit = allButtons.find(isSubmitButton);
        if (submit) {
             submit.click();
             return { ok: true, method: "click" };
        }
        
        editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter" }));
        return { ok: true, method: "enter" };
    })()`;

    const targetContexts = cdp.contexts.filter(c =>
        (c.url && c.url.includes(SELECTORS.CONTEXT_URL_KEYWORD)) ||
        (c.name && c.name.includes('Extension'))
    );

    const contextsToTry = targetContexts.length > 0 ? targetContexts : cdp.contexts;
    for (const ctx of contextsToTry) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value?.ok) {
                logInteraction('INJECT', `Sent: ${text} (Context: ${ctx.id})`);
                return res.result.value;
            }
        } catch (e) { }
    }

    if (targetContexts.length > 0) {
        const otherContexts = cdp.contexts.filter(c => !targetContexts.includes(c));
        for (const ctx of otherContexts) {
            try {
                const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
                if (res.result?.value?.ok) {
                    logInteraction('INJECT', `Sent: ${text} (Fallback Context: ${ctx.id})`);
                    return res.result.value;
                }
            } catch (e) { }
        }
    }
    return { ok: false, error: `Injection failed. Tried ${cdp.contexts.length} contexts.` };
}

export async function checkIsGenerating(cdp) {
    const EXP = `(() => {
        function findAgentFrame(win) {
             const iframes = document.querySelectorAll('iframe');
             for(let i=0; i<iframes.length; i++) {
                 if(iframes[i].src.includes('cascade-panel')) {
                     try { return iframes[i].contentDocument; } catch(e){}
                 }
             }
             return document;
        }
        const doc = findAgentFrame(window);
        const win = doc.defaultView || window;
        
        function isVisible(el) {
            if (!el || el.offsetParent === null) return false;
            const style = win.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            // cascade buttons display flex but scale or width may be 0 during transitions sometimes,
            // though usually they just toggle display or remove the element.
            if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
            return true;
        }

        // 1. Tooltip cancel button
        const cancel = doc.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (isVisible(cancel)) return true;
        
        // 2. Button with Stop icon
        const stopIcon = doc.querySelector('button svg.lucide-square');
        if (stopIcon && isVisible(stopIcon.closest('button'))) return true;

        // 3. Aria-label stop
        const stopAria = doc.querySelector('button[aria-label="Stop generating"]');
        if (isVisible(stopAria)) return true;

        // 4. Any button with text "Stop generating"
        const btns = Array.from(doc.querySelectorAll('button'));
        for (const b of btns) {
            if (isVisible(b) && b.innerText.toLowerCase().includes('stop generating')) return true;
        }

        return false;
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value === true) return true;
        } catch (e) { }
    }
    return false;
}

export async function getLastResponse(cdp) {
    const EXP = `(() => {
        function getTargetDoc() {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                if (iframes[i].src.includes('cascade-panel')) {
                    try { return iframes[i].contentDocument; } catch(e) {}
                }
            }
            return document;
        }
        const doc = getTargetDoc();
        
        // 1. 各種既知のセレクタで候補を探す
        let candidates = Array.from(doc.querySelectorAll([
            '[data-message-author="assistant"]',
            '[data-message-role="assistant"]',
            '.prose.assistant',
            '.prose',
            '.group.relative.flex.gap-3',
            '.leading-relaxed.select-text.text-sm', // 最新のAntigravity/Cascade メッセージUI
            '.whitespace-pre-wrap.break-words'
        ].join(', ')));
        
        if (candidates.length === 0) return null;
        
        // 最後の要素を取得
        const lastMsg = candidates[candidates.length - 1];
        
        // 内部にさらに具体的なテキストコンテナがあれば優先する
        const textContainer = lastMsg.querySelector('.prose') || lastMsg;
        let text = textContainer.innerText || '';
        
        return { text: text.trim(), images: Array.from(lastMsg.querySelectorAll('img')).map(img => img.src) };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value?.text) return res.result.value;
        } catch (e) { console.error("CDP Evaluate Error (getLastResponse):", e); }
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
                    try { return iframes[i].contentDocument; } catch(e) {}
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
            if (txt === 'stop' || txt === '停止') {
                btn.click();
                return { success: true };
            }
        }
        return { success: false, reason: 'Cancel button not found' };
    })()`;
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
