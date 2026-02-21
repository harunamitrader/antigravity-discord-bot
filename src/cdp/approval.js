import { logInteraction } from '../utils/logger.js';

export async function checkApprovalRequired(cdp) {
    const EXP = `(() => {
        function getTargetDoc() {
            const iframes = document.querySelectorAll('iframe');
            for(let i=0; i<iframes.length; i++) {
                if(iframes[i].src.includes('cascade-panel')) {
                    try { return iframes[i].contentDocument; } catch(e){}
                }
            }
            return document; 
        }
        const doc = getTargetDoc();
        if (!doc) return null;

        const approvalKeywords = [
            'run', 'approve', 'allow', 'yes', 'accept', 'confirm', 
            'save', 'apply', 'create', 'update', 'delete', 'remove', 'submit', 'send', 'retry', 'continue',
            'always allow', 'allow once', 'allow this conversation',
            '実行', '許可', '承認', 'はい', '同意', '保存', '適用', '作成', '更新', '削除', '送信', '再試行', '続行'
        ];
        const anchorKeywords = ['cancel', 'reject', 'deny', 'ignore', 'キャンセル', '拒否', '無視', 'いいえ', '不許可'];
        const ignoreKeywords = ['auto'];

        let found = null;

        function scan(root) {
            if (found) return;
            if (!root) return;
            
            const potentialAnchors = Array.from(root.querySelectorAll ? root.querySelectorAll('button, [role="button"], .cursor-pointer') : []).filter(el => {
                if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                const txt = (el.innerText || '').trim().toLowerCase();
                return anchorKeywords.some(kw => txt === kw || txt.startsWith(kw + ' '));
            });

            for (const anchor of potentialAnchors) {
                if (found) return;
                const searchScope = anchor.closest('.flex.flex-col.gap-2') || 
                                    anchor.closest('.group') || 
                                    anchor.closest('.prose')?.parentElement ||
                                    anchor.parentElement?.parentElement?.parentElement || 
                                    anchor.parentElement?.parentElement ||
                                    anchor.parentElement;
                
                if (!searchScope) continue;

                const buttons = Array.from(searchScope.querySelectorAll('button, [role="button"], .cursor-pointer'));
                
                const approvalButton = buttons.find(btn => {
                    if (btn === anchor) return false;
                    if (btn.offsetWidth === 0) return false;
                    
                    const txt = (btn.innerText || '').toLowerCase().trim();
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
                    const title = (btn.getAttribute('title') || '').toLowerCase().trim();
                    const combined = txt + ' ' + aria + ' ' + title;
                    
                    return approvalKeywords.some(kw => combined.includes(kw)) && 
                           !ignoreKeywords.some(kw => combined.includes(kw));
                });

                if (approvalButton) {
                    let textContext = "Command or Action requiring approval";
                    const itemContainer = searchScope.closest('.flex.flex-col.gap-2.border-gray-500\\\\/25') || 
                                          searchScope.closest('.group') || 
                                          searchScope.closest('.prose')?.parentElement;
                    
                    if (itemContainer) {
                         const prose = itemContainer.querySelector('.prose');
                         const pre = itemContainer.querySelector('pre');
                         const header = itemContainer.querySelector('.text-sm.border-b') || itemContainer.querySelector('.font-semibold');
                         
                         let msg = [];
                         if (header) msg.push(\`[Header] \${header.innerText.trim()}\`);
                         if (prose) msg.push(prose.innerText.trim());
                         if (pre) msg.push(\`[Command] \${pre.innerText.trim()}\`);
                         
                         if (msg.length > 0) textContext = msg.join('\\n\\n');
                         else textContext = itemContainer.innerText.trim();
                    }
                    found = { required: true, message: textContext.substring(0, 1500) };
                    return;
                }
            }

            try {
                const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let n;
                while (n = walker.nextNode()) {
                    if (found) return;
                    if (n.shadowRoot) scan(n.shadowRoot);
                }
            } catch(e){}
        }

        scan(doc.body);
        return found;
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value?.required) return res.result.value;
        } catch (e) { }
    }
    return null;
}

export async function clickApproval(cdp, allow) {
    const isAllowStr = allow ? 'true' : 'false';
    const EXP = `(async () => {
        function getTargetDoc() {
            const iframes = document.querySelectorAll('iframe');
            for(let i=0; i<iframes.length; i++) {
                if(iframes[i].src.includes('cascade-panel')) {
                    try { return iframes[i].contentDocument; } catch(e){}
                }
            }
            return document; 
        }
        const doc = getTargetDoc();
        if (!doc) return { success: false, log: ["No document found"] };

        const approvalKeywords = [
            'run', 'approve', 'allow', 'yes', 'accept', 'confirm', 
            'save', 'apply', 'create', 'update', 'delete', 'remove', 'submit', 'send', 'retry', 'continue',
            'always allow', 'allow once', 'allow this conversation',
            '実行', '許可', '承認', 'はい', '同意', '保存', '適用', '作成', '更新', '削除', '送信', '再試行', '続行'
        ];
        const anchorKeywords = ['cancel', 'reject', 'deny', 'ignore', 'キャンセル', '拒否', '無視', 'いいえ', '不許可'];
        const ignoreKeywords = ['auto'];
        
        const isAllow = ${isAllowStr};
        let foundBtn = null;
        let log = [];

        function triggerClick(el) {
            try {
                const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window });
                el.dispatchEvent(pointerDown);
                const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window });
                el.dispatchEvent(pointerUp);
                el.click();
            } catch(e) {
                el.click();
            }
        }

        function scan(root) {
            if (foundBtn) return;
            if (!root) return;
            
            const potentialAnchors = Array.from(root.querySelectorAll ? root.querySelectorAll('button, [role="button"], .cursor-pointer') : []).filter(el => {
                if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                const txt = (el.innerText || '').trim().toLowerCase();
                return anchorKeywords.some(kw => txt === kw || txt.startsWith(kw + ' '));
            });

            for (const anchor of potentialAnchors) {
                if (foundBtn) return;
                const searchScope = anchor.closest('.flex.flex-col.gap-2') || 
                                    anchor.closest('.group') || 
                                    anchor.closest('.prose')?.parentElement ||
                                    anchor.parentElement?.parentElement?.parentElement || 
                                    anchor.parentElement?.parentElement ||
                                    anchor.parentElement;
                
                if (!searchScope) continue;

                if (!isAllow) {
                    // Reject logic
                    foundBtn = anchor;
                    log.push("Found reject anchor: " + (anchor.innerText||'').trim());
                    return;
                }

                const buttons = Array.from(searchScope.querySelectorAll('button, [role="button"], .cursor-pointer'));
                const approvalButton = buttons.find(btn => {
                    if (btn === anchor) return false;
                    if (btn.offsetWidth === 0) return false;
                    
                    const txt = (btn.innerText || '').toLowerCase().trim();
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
                    const title = (btn.getAttribute('title') || '').toLowerCase().trim();
                    const combined = txt + ' ' + aria + ' ' + title;
                    
                    return approvalKeywords.some(kw => combined.includes(kw) || combined.startsWith(kw + ' ')) && 
                           !ignoreKeywords.some(kw => combined.includes(kw));
                });

                if (approvalButton) {
                    foundBtn = approvalButton;
                    log.push("Found approval button: " + (approvalButton.innerText||'').trim());
                    return;
                }
            }

            try {
                const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let n;
                while (n = walker.nextNode()) {
                    if (foundBtn) return;
                    if (n.shadowRoot) scan(n.shadowRoot);
                }
            } catch(e){}
        }

        scan(doc.body);
        
        if (foundBtn) {
            triggerClick(foundBtn);
            return { success: true, log: log };
        }
        
        return { success: false, log: log };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const evalPromise = cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
            const res = await Promise.race([evalPromise, timeoutPromise]);
            if (res.result?.value?.success) {
                logInteraction('CLICK', `Approval / Rejection clicked: ${allow} (success) - Log: ${JSON.stringify(res.result.value.log)}`);
                return res.result.value;
            } else if (res.result?.value?.log) {
                logInteraction('CLICK_FAIL_LOG', `Tried ctx ${ctx.id}: ${JSON.stringify(res.result.value.log)}`);
            }
        } catch (e) { }
    }
    logInteraction('CLICK', `Approval / Rejection clicked: ${allow} (failed)`);
    return { success: false };
}
