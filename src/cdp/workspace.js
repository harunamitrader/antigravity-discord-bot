import { logInteraction } from '../utils/logger.js';

export async function startNewChat(cdp) {
    const EXP = `(() => {
        function getTargetDoc() {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                if (iframes[i].src.includes('cascade-panel')) {
                    try { return iframes[i].contentDocument; } catch(e) {}
                }
            }
            return null;
        }
        const selectors = [
            '[data-tooltip-id="new-conversation-tooltip"]',
            '[data-tooltip-id*="new-chat"]',
            '[data-tooltip-id*="new_chat"]',
            '[aria-label*="New Chat"]',
            '[aria-label*="New Conversation"]'
        ];
        const docs = [document];
        const iframeDoc = getTargetDoc();
        if (iframeDoc) docs.push(iframeDoc);
        for (const doc of docs) {
            for (const sel of selectors) {
                const btn = doc.querySelector(sel);
                if (btn) { btn.click(); return { success: true, method: sel }; }
            }
        }
        return { success: false };
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value?.success) {
                logInteraction('NEWCHAT', 'New chat started. Method: ' + res.result.value.method);
                return true;
            }
        } catch (e) { }
    }
    return false;
}

export async function getCurrentTitle(cdp) {
    const EXP = `(() => {
        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch(e) {}
        }
        for (const doc of docs) {
            const els = doc.querySelectorAll('p.text-ide-sidebar-title-color');
            for (const el of els) {
                const txt = (el.innerText || '').trim();
                if (txt.length > 1) return txt;
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

export async function getCurrentModel(cdp) {
    const EXP = `(() => {
        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch(e) {}
        }
        for (const doc of docs) {
            const buttons = Array.from(doc.querySelectorAll('button, div[role="button"]'));
            for (const btn of buttons) {
                const txt = (btn.textContent || '').trim();
                const lower = txt.toLowerCase();
                
                if (btn.hasAttribute('aria-expanded')) {
                    if (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('model')) {
                        return txt;
                    }
                }
                
                if (txt.length > 3 && txt.length < 50 && (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt'))) {
                    if (btn.querySelector('svg')) {
                        return txt;
                    }
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
        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch(e) {}
        }
        let targetDoc = null;
        for (const doc of docs) {
            const buttons = Array.from(doc.querySelectorAll('button, div[role="button"]'));
            for (const btn of buttons) {
                const txt = (btn.textContent || '').trim();
                const lower = txt.toLowerCase();
                if (btn.hasAttribute('aria-expanded')) {
                    if (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('model')) {
                        btn.click();
                        targetDoc = doc;
                        break;
                    }
                }
                if (!targetDoc && txt.length > 3 && txt.length < 50 && (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt'))) {
                    if (btn.querySelector('svg')) {
                        btn.click();
                        targetDoc = doc;
                        break;
                    }
                }
            }
            if (targetDoc) break;
        }
        if (!targetDoc) return JSON.stringify([]);
        await new Promise(r => setTimeout(r, 1000));
        
        let models = [];
        const options = Array.from(targetDoc.querySelectorAll('div.cursor-pointer'));
        for (const opt of options) {
            if (opt.className.includes('px-') || opt.className.includes('py-')) {
                 const txt = (opt.textContent || '').replace('New', '').trim();
                 if(txt.length > 3 && txt.length < 50 && (txt.toLowerCase().includes('claude') || txt.toLowerCase().includes('gemini') || txt.toLowerCase().includes('gpt') || txt.toLowerCase().includes('o1') || txt.toLowerCase().includes('o3'))) {
                     if(!models.includes(txt)) models.push(txt);
                 }
            }
        }
        
        const openBtn = targetDoc.querySelector('button[aria-expanded="true"], div[role="button"][aria-expanded="true"]');
        if (openBtn) openBtn.click();
        
        return JSON.stringify(models);
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value) {
                const models = JSON.parse(res.result.value);
                if (models.length > 0) return models;
            }
        } catch (e) { }
    }
    return [];
}

export async function switchModel(cdp, targetName) {
    const SWITCH_EXP = `(async () => {
        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch(e) {}
        }
        let targetDoc = null;
        for (const doc of docs) {
            const buttons = Array.from(doc.querySelectorAll('button, div[role="button"]'));
            for (const btn of buttons) {
                const txt = (btn.textContent || '').trim();
                const lower = txt.toLowerCase();
                if (btn.hasAttribute('aria-expanded')) {
                    if (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('model')) {
                        btn.click();
                        targetDoc = doc;
                        break;
                    }
                }
                if (!targetDoc && txt.length > 3 && txt.length < 50 && (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt'))) {
                    if (btn.querySelector('svg')) {
                        btn.click();
                        targetDoc = doc;
                        break;
                    }
                }
            }
            if (targetDoc) break;
        }
        if (!targetDoc) return JSON.stringify({ success: false, reason: 'button not found' });
        await new Promise(r => setTimeout(r, 1000));
        
        const target = ${JSON.stringify(targetName)}.toLowerCase();
        const options = Array.from(targetDoc.querySelectorAll('div.cursor-pointer'));
        for (const opt of options) {
            if (opt.className.includes('px-') || opt.className.includes('py-')) {
                 const txt = (opt.textContent || '').replace('New', '').trim();
                 if (txt.toLowerCase().includes(target)) {
                     opt.click();
                     return JSON.stringify({ success: true, model: txt });
                 }
            }
        }
        
        const openBtn = targetDoc.querySelector('button[aria-expanded="true"], div[role="button"][aria-expanded="true"]');
        if (openBtn) openBtn.click();
        return JSON.stringify({ success: false, reason: 'model not found in options list' });
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
        const spans = doc.querySelectorAll('span.text-xs.select-none');
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
        const toggles = doc.querySelectorAll('div[role="button"][aria-haspopup="dialog"]');
        let clicked = false;
        for (const t of toggles) {
            const txt = (t.innerText || '').trim();
            if (txt === 'Planning' || txt === 'Fast') {
                t.querySelector('button').click();
                clicked = true;
                break;
            }
        }
        if (!clicked) return JSON.stringify({ success: false, reason: 'toggle not found' });
        await new Promise(r => setTimeout(r, 1000));
        const target = ${JSON.stringify(targetMode)};
        const dialogs = doc.querySelectorAll('div[role="dialog"]');
        for (const dialog of dialogs) {
            const txt = (dialog.innerText || '');
            if (txt.includes('Conversation mode') || txt.includes('Planning') && txt.includes('Fast')) {
                const divs = dialog.querySelectorAll('div.font-medium');
                for (const d of divs) {
                    if (d.innerText.trim().toLowerCase() === target.toLowerCase()) {
                        d.click();
                        return JSON.stringify({ success: true, mode: d.innerText.trim() });
                    }
                }
            }
        }
        return JSON.stringify({ success: false, reason: 'mode not found in dialog' });
    }) ()`;

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
