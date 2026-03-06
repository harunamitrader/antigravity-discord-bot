// --- テキスト処理関数群 ---
// 外部状態に依存しない純粋関数のみで構成

export function isUiChromeLine(line) {
    const t = String(line || '').trim().toLowerCase();
    if (!t) return true;
    if (/^[+-]\d+$/.test(t)) return true;
    if (/^\d+\s+chars[驕ｯ・ｶ繝ｻ・｢繝ｻ繧托ｽｽ・ｷ].*$/i.test(t)) return true;
    if (t === 'analyzed' || t.startsWith('analyzed ')) return true;
    if (t === 'thinking' || t === 'generating' || t === 'generating..' || t === 'generating...') return true;
    if (t.startsWith('thought for ')) return true;
    if (t === 'planning' || t === 'fast') return true;
    if (t === 'review changes') return true;
    if (t === 'add context' || t === 'media' || t === 'mentions' || t === 'workflows') return true;
    if (t === 'conversation mode' || t === 'model' || t === 'new' || t === 'send') return true;
    if (/^\d+\s+files?\s+with\s+changes$/i.test(t)) return true;
    if (t === 'git graph') return true;
    if (t === 'antigravity - settings') return true;
    if (t === 'agq') return true;
    if (/^pro\s+\d+%\s+flash\s+\d+%/i.test(t)) return true;
    if (/^(css|html|javascript|typescript|json)$/i.test(t)) return true;
    if (/^(crlf|lf|utf-8|utf8)$/i.test(t)) return true;
    if (/^ln\s+\d+,\s*col\s+\d+$/i.test(t)) return true;
    if (t === 'reject all' || t === 'accept all') return true;
    if (t.includes('ask anything, @ to mention')) return true;
    if (t.startsWith('agent can plan before executing tasks')) return true;
    if (t.startsWith('agent will execute tasks directly')) return true;
    if (t.startsWith('prioritizing specific tools')) return true;
    if (t.startsWith('gemini ') || t.startsWith('claude ') || t.startsWith('gpt-')) return true;
    if (t === 'files edited' || t === 'progress updates' || t === 'continue') return true;
    if (t === 'good' || t === 'bad') return true;
    if (t.startsWith('info: server is started')) return true;
    if (t.startsWith('allow directory access to')) return true;
    if (t.startsWith('allow file access to')) return true;
    if (t.startsWith('allow access to')) return true;

    // Aggressive filters for Diff and Assistant Message UI panels
    if (/^\s*diff\s+summary\s*$/i.test(t)) return true;
    if (/^\s*files\s+changed\s*$/i.test(t)) return true;
    if (/^\s*assistant\s+message\s*$/i.test(t)) return true;
    if (/^\s*\d+\s+file\(s\)\s*$/i.test(t)) return true;
    if (/^\s*reject\s*all\s*accept\s*all\s*$/i.test(t)) return true;
    if (/^\s*\+\d+\s*-\d+\s*$/i.test(t)) return true;
    if (t.endsWith('.js') || t.endsWith('.ts') || t.endsWith('.css') || t.endsWith('.html') || t.endsWith('.md')) {
        if (t === 'discord_bot.js' || t.includes('\\discord_bot.js') || t === 'discord_bot_clean.js') return true;
        if (t === 'task.md' || t.includes('\\task.md')) return true;
    }

    // Antigravity command execution UI chrome
    if (/^ran\s+command$/i.test(t)) return true;
    if (/^always\s+run$/i.test(t)) return true;
    if (/^exit\s+code\s+\d+$/i.test(t)) return true;
    if (/^relocate(\s|$)/i.test(t)) return true;
    if (/^auto-accept:/i.test(t)) return true;
    if (/^情報:\s*auto-accept/i.test(t)) return true;
    if (t.startsWith('ps c:\\') || t.startsWith('ps c:/')) return true;
    if (/^…\\/.test(t) || /^…\//.test(t)) return true;
    if (/^[\w.]+\\[a-z]+ > /.test(t)) return true;
    if (/^\^\s*$/.test(t)) return true;
    if (t === 'good 👍' || t === 'bad 👎' || t === 'good' || t === 'bad') return true;

    return false;
}

export function containsCjk(text) {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(text || ''));
}

export function isProgressNarrationLine(line) {
    const t = String(line || '').trim().toLowerCase();
    if (!t) return false;
    if (/^(planning|developing|constructing|implementing|refining|finalizing|initiating|commencing|crafting|verifying|calculating|styling|building)\b/.test(t)) return true;
    if (/^(i('| a)m|i have|i've|i am|my aim is|i plan to|i'm currently|i'm focusing|i have begun|i just started|now,?\s*i('| a)m)\b/.test(t)) return true;
    if (t.startsWith('creating task and implementation plan')) return true;
    if (t.startsWith('creating index.html')) return true;
    if (t.startsWith('testing the app')) return true;
    return false;
}

export function isTerminalNoiseLine(line) {
    const t = String(line || '').trim().toLowerCase();
    if (!t) return true;
    if (isUiChromeLine(t)) return true;
    if (t === 'edited') return true;
    if (/^[+-]\d+$/.test(t)) return true;
    if (/^\d+\s+files?\s+with\s+changes$/i.test(t)) return true;
    if (/^\d+\s+chars[驕ｯ・ｶ繝ｻ・｢繝ｻ繧托ｽｽ・ｷ].*$/i.test(t)) return true;
    if (/^[a-z]:\\.+$/i.test(t)) return true;
    return false;
}

export function isFinalSummaryLine(line) {
    const s = String(line || '').trim();
    if (!s) return false;
    if (isStrongFinalSummaryLine(s)) return true;
    if (/(created|completed|directory|files?)/i.test(s)) return true;
    return false;
}

export function isStrongFinalSummaryLine(line) {
    const s = String(line || '').trim();
    if (!s) return false;
    if (/(髫ｰ謔ｶ繝ｻ繝ｻ・ｮ陞｢・ｹ繝ｻ繝ｻ・ｹ・ｧ陟募ｨｯ陞ｺ驛｢譎｢・ｽ・ｯ驛｢譎｢・ｽ・ｼ驛｢・ｧ繝ｻ・ｯ驛｢・ｧ繝ｻ・ｹ驛｢譎擾ｽ｣・ｹ郢晢ｽｻ驛｢・ｧ繝ｻ・ｹ|髣比ｼ夲ｽｽ・･髣包ｽｳ闕ｵ譏ｴ繝ｻ驛｢譏ｴ繝ｻ邵ｺ繝ｻ・ｹ譎｢・ｽ・ｬ驛｢・ｧ繝ｻ・ｯ驛｢譎冗樟・主ｿｿ髣比ｼ夲ｽｽ・･髣包ｽｳ闕ｵ譏ｴ繝ｻ3驍ｵ・ｺ繝ｻ・､驍ｵ・ｺ繝ｻ・ｮ驛｢譎・ｽｼ譁撰ｼ憺Δ・ｧ繝ｻ・､驛｢譎｢・ｽ・ｫ|髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ陷会ｽｱ遶擾ｽｪ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ隰疲ｻゑｽｽ・ｮ陟包ｽ｡繝ｻ・ｺ郢晢ｽｻ髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ髴郁ｲｻ・ｽ讙趣ｽｸ・ｺ繝ｻ・ｾ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ髯橸ｽｳ陟包ｽ｡繝ｻ・ｺ郢晢ｽｻ繝ｻ・ｰ驍ｵ・ｺ繝ｻ・ｾ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ驍ｵ・ｺ鬯伜∞・ｽ・ｩ繝ｻ・ｦ驍ｵ・ｺ陷会ｽｱ繝ｻ・･驍ｵ・ｺ繝ｻ・ｰ驍ｵ・ｺ髴郁ｲｻ・ｼ譯埼Δ・ｧ繝ｻ・ｫ驛｢・ｧ繝ｻ・ｹ驛｢・ｧ繝ｻ・ｿ驛｢譎・ｽｧ・ｭ邵ｺ繝ｻ・ｹ・ｧ繝ｻ・ｺ|鬮ｫ・ｱ繝ｻ・ｿ髫ｰ・ｨ繝ｻ・ｴ)/i.test(s)) return true;
    if (/^(the app has been created|i created the following files|created the following files)/i.test(s)) return true;
    return false;
}

export function scoreParagraphForFinalSummary(paragraph) {
    const p = String(paragraph || '').trim();
    if (!p) return -1000;
    let score = meaningfulBodyScore(p);
    if (isProgressNarrationLine(p)) score -= 1200;
    if (!containsCjk(p) && /^(planning|developing|constructing|implementing|refining|finalizing|initiating|commencing|crafting|verifying|calculating|styling|building)\b/i.test(p)) score -= 900;
    if (/^(i('| a)m|i have|i've|i am|my aim is|i plan to|i'm currently|i'm focusing)/i.test(p)) score -= 800;
    if (/(index\.html|style\.css|script\.js|\.html|\.css|\.js)/i.test(p)) score += 120;
    if (/(髫ｰ謔ｶ繝ｻ繝ｻ・ｮ陞｢・ｹ繝ｻ繝ｻ・ｹ・ｧ陟募ｨｯ陞ｺ驛｢譎｢・ｽ・ｯ驛｢譎｢・ｽ・ｼ驛｢・ｧ繝ｻ・ｯ驛｢・ｧ繝ｻ・ｹ驛｢譎擾ｽ｣・ｹ郢晢ｽｻ驛｢・ｧ繝ｻ・ｹ|髣比ｼ夲ｽｽ・･髣包ｽｳ闕ｵ譏ｴ繝ｻ驛｢譏ｴ繝ｻ邵ｺ繝ｻ・ｹ譎｢・ｽ・ｬ驛｢・ｧ繝ｻ・ｯ驛｢譎冗樟・主ｿｿ髣比ｼ夲ｽｽ・･髣包ｽｳ闕ｵ譏ｴ繝ｻ3驍ｵ・ｺ繝ｻ・､驍ｵ・ｺ繝ｻ・ｮ驛｢譎・ｽｼ譁撰ｼ憺Δ・ｧ繝ｻ・､驛｢譎｢・ｽ・ｫ|髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ陷会ｽｱ遶擾ｽｪ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ隰疲ｻゑｽｽ・ｮ陟包ｽ｡繝ｻ・ｺ郢晢ｽｻ髣厄ｽｴ隲帛現繝ｻ驍ｵ・ｺ髴郁ｲｻ・ｽ讙趣ｽｸ・ｺ繝ｻ・ｾ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ髯橸ｽｳ陟包ｽ｡繝ｻ・ｺ郢晢ｽｻ繝ｻ・ｰ驍ｵ・ｺ繝ｻ・ｾ驍ｵ・ｺ陷会ｽｱ隨ｳ繝ｻ驍ｵ・ｺ鬯伜∞・ｽ・ｩ繝ｻ・ｦ驍ｵ・ｺ陷会ｽｱ繝ｻ・･驍ｵ・ｺ繝ｻ・ｰ驍ｵ・ｺ髴郁ｲｻ・ｼ譯皇reated|completed)/i.test(p)) score += 900;
    if (containsCjk(p)) score += 220;
    if (/^(good|bad)$/im.test(p)) score -= 800;
    if (/info:\s*server is started/i.test(p)) score -= 1000;
    return score;
}

export function cleanupNoiseLines(text) {
    let preprocessed = String(text || '').replace(/\r/g, '');
    preprocessed = preprocessed.replace(/diff\s+summary[\s\S]*?files\s+changed[\s\S]*?assistant\s+message/ig, '');
    preprocessed = preprocessed.replace(/ran\s+command[\s\S]*?(?=exit\s+code\s+\d+)/ig, '');
    preprocessed = preprocessed.replace(/exit\s+code\s+\d+/ig, '');
    preprocessed = preprocessed.replace(/always\s+run\s*\^?/ig, '');
    preprocessed = preprocessed.replace(/(?:Edited\s*)?(?:!\[.*?\]\(.*?\)\s*)?[a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+\+\d+\s*-\d+/ig, '');
    preprocessed = preprocessed.replace(/reject\s*all\s*accept\s*all/ig, '');
    preprocessed = preprocessed.replace(/^(情報:|info:)\s*auto-accept[^\n]*/gim, '');
    preprocessed = preprocessed.replace(/^auto-accept:[^\n]*/gim, '');

    const lines = preprocessed.split('\n');
    const out = [];
    for (const raw of lines) {
        const line = String(raw || '').replace(/\s+$/g, '');
        const t = line.trim();
        if (!t) {
            out.push('');
            continue;
        }
        if (isTerminalNoiseLine(t)) continue;
        out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractFinalAssistantSummary(text) {
    const cleaned = cleanupNoiseLines(text);
    if (!cleaned) return '';

    const lines = cleaned.split('\n').map(l => l.trimRight());
    const finalLineIndexes = [];
    const strongFinalLineIndexes = [];
    for (let i = 0; i < lines.length; i++) {
        const t = String(lines[i] || '').trim();
        if (!t) continue;
        if (isFinalSummaryLine(t)) finalLineIndexes.push(i);
        if (isStrongFinalSummaryLine(t)) strongFinalLineIndexes.push(i);
    }
    let pickedFinalIdx = -1;
    if (strongFinalLineIndexes.length > 0) {
        const lastStrong = strongFinalLineIndexes[strongFinalLineIndexes.length - 1];
        const windowStart = Math.max(0, lastStrong - 40);
        const firstStrongNearTail = strongFinalLineIndexes.find(i => i >= windowStart);
        pickedFinalIdx = Number.isInteger(firstStrongNearTail) ? firstStrongNearTail : lastStrong;
    } else if (finalLineIndexes.length > 0) {
        pickedFinalIdx = finalLineIndexes[finalLineIndexes.length - 1];
    }
    if (pickedFinalIdx >= 0) {
        let startIdx = Math.max(0, pickedFinalIdx - 6);
        for (let i = startIdx; i < pickedFinalIdx; i++) {
            const t = String(lines[i] || '').trim();
            if (!t) continue;
            if (isProgressNarrationLine(t)) {
                startIdx = i + 1;
            }
        }
        const tail = lines.slice(startIdx)
            .filter(line => !isProgressNarrationLine(line))
            .filter(line => !isTerminalNoiseLine(line))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (tail) return tail;
    }

    const paragraphs = [];
    let current = [];
    for (const line of lines) {
        if (!line.trim()) {
            if (current.length > 0) {
                paragraphs.push(current.join('\n').trim());
                current = [];
            }
            continue;
        }
        current.push(line);
    }
    if (current.length > 0) paragraphs.push(current.join('\n').trim());
    if (paragraphs.length === 0) return '';

    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < paragraphs.length; i++) {
        const s = scoreParagraphForFinalSummary(paragraphs[i]) + Math.floor(i * 8);
        if (s >= bestScore) {
            bestScore = s;
            bestIdx = i;
        }
    }

    if (bestIdx < 0) return '';
    let start = bestIdx;
    for (let i = bestIdx; i >= Math.max(0, bestIdx - 2); i--) {
        if (isFinalSummaryLine(paragraphs[i])) {
            start = i;
        }
    }

    const selected = [];
    for (let i = start; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const sc = scoreParagraphForFinalSummary(p);
        if (selected.length > 0 && sc < -150) break;
        if (selected.length > 0 && isProgressNarrationLine(p)) break;
        if (sc < -400) continue;
        selected.push(p);
        if (selected.join('\n\n').length > 3500) break;
    }

    const joined = selected.join('\n\n').trim() || paragraphs[bestIdx];
    return cleanupNoiseLines(joined);
}

export function detectPromptFromRawText(rawText) {
    const lines = String(rawText || '')
        .replace(/\r/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    if (lines.length === 0) return '';

    for (const line of lines.slice(0, 25)) {
        if (isTerminalNoiseLine(line)) continue;
        if (isProgressNarrationLine(line)) continue;
        if (isFinalSummaryLine(line)) continue;
        if (/^[a-z]:\\/.test(line)) continue;
        if (line.length < 8 || line.length > 300) continue;
        if (/\[run:\d+\]/i.test(line)) return line;
        if (/(please|create|build)/i.test(line)) return line;
    }
    return '';
}

export function extractStructuredAssistantContent(rawText, promptText = '') {
    let text = String(rawText || '').replace(/\r/g, '');
    const prompt = String(promptText || '').trim();
    if (prompt && text.includes(prompt)) {
        const idx = text.lastIndexOf(prompt);
        if (idx >= 0) text = text.slice(idx + prompt.length);
    }

    const lines = text.split('\n').map(line => line.replace(/\s+$/g, ''));
    const bodyLines = [];
    const changes = [];
    const seenFiles = new Set();
    let filesWithChanges = null;
    let insertions = null;
    let deletions = null;
    let pendingPlus = null;
    let pendingMinus = null;

    const pushChange = (file, add, del) => {
        const normalizedFile = String(file || '').trim();
        if (!normalizedFile) return;
        const key = normalizedFile.toLowerCase();
        if (seenFiles.has(key)) return;
        seenFiles.add(key);
        changes.push({
            file: normalizedFile,
            insertions: Number(add) || 0,
            deletions: Number(del) || 0
        });
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = String(raw || '').trim();
        const lower = line.toLowerCase();
        if (!line) continue;

        const fileCountMatch = line.match(/^(\d+)\s+files?\s+with\s+changes$/i);
        if (fileCountMatch) {
            const count = Number(fileCountMatch[1]);
            filesWithChanges = count > 0 ? count : null;
            continue;
        }

        const bothMatch = line.match(/^(\d+)\s+insertions?\s*\(\+\)\s+(\d+)\s+deletions?\s*\(-\)$/i);
        if (bothMatch) {
            const ins = Number(bothMatch[1]);
            const del = Number(bothMatch[2]);
            insertions = ins > 0 ? ins : null;
            deletions = del > 0 ? del : null;
            continue;
        }
        const insMatch = line.match(/^(\d+)\s+insertions?\s*\(\+\)$/i);
        if (insMatch) {
            const ins = Number(insMatch[1]);
            insertions = ins > 0 ? ins : null;
            continue;
        }
        const delMatch = line.match(/^(\d+)\s+deletions?\s*\(-\)$/i);
        if (delMatch) {
            const delVal = Number(delMatch[1]);
            deletions = delVal > 0 ? delVal : null;
            continue;
        }

        let editedMatch = line.match(/^edited\b.*?([a-z0-9._-]+\.[a-z0-9]+)\s+\+(\d+)\s*-\s*(\d+)$/i);
        if (!editedMatch) {
            editedMatch = line.match(/^([a-z0-9._-]+\.[a-z0-9]+)\s+\+(\d+)\s*-\s*(\d+)$/i);
        }
        if (editedMatch) {
            pushChange(editedMatch[1], editedMatch[2], editedMatch[3]);
            continue;
        }

        if (/^\+\d+$/.test(line)) {
            pendingPlus = Number(line.slice(1));
            continue;
        }
        if (/^-\d+$/.test(line) && pendingPlus !== null) {
            pendingMinus = Number(line.slice(1));
            continue;
        }

        if (pendingPlus !== null && pendingMinus !== null) {
            const nameMatch = line.match(/^([a-z0-9._-]+\.[a-z0-9]+)$/i);
            const pathMatch = line.match(/[\\\/]([a-z0-9._-]+\.[a-z0-9]+)$/i);
            if (nameMatch || pathMatch) {
                const file = nameMatch ? nameMatch[1] : pathMatch[1];
                pushChange(file, pendingPlus, pendingMinus);
                pendingPlus = null;
                pendingMinus = null;
                continue;
            }
        }

        if (lower === 'edited') continue;
        if (isUiChromeLine(line)) continue;
        if (/^[a-z]:\\/i.test(line)) continue;

        bodyLines.push(line);
    }

    const bodyText = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return {
        bodyText,
        changes,
        filesWithChanges,
        insertions,
        deletions
    };
}

export function buildChangeSection(structured) {
    const lines = [];
    const hasFileCount = Number.isInteger(structured?.filesWithChanges) && structured.filesWithChanges > 0;
    const hasInsertions = Number.isInteger(structured?.insertions) && structured.insertions > 0;
    const hasDeletions = Number.isInteger(structured?.deletions) && structured.deletions > 0;

    if (hasFileCount || hasInsertions || hasDeletions) {
        const summary = [];
        if (hasFileCount) summary.push(`${structured.filesWithChanges} file(s)`);
        if (hasInsertions) summary.push(`${structured.insertions} insertions (+)`);
        if (hasDeletions) summary.push(`${structured.deletions} deletions (-)`);
        if (summary.length > 0) lines.push(`### Diff Summary\n${summary.join(' / ')}`);
    }

    const nonZeroChanges = Array.isArray(structured?.changes)
        ? structured.changes.filter(ch => (Number(ch?.insertions) > 0 || Number(ch?.deletions) > 0))
        : [];
    if (nonZeroChanges.length > 0) {
        lines.push('### Files Changed');
        for (const ch of nonZeroChanges.slice(0, 30)) {
            lines.push(`- \`${ch.file}\` \`+${ch.insertions} -${ch.deletions}\``);
        }
    }

    return lines.join('\n').trim();
}

export function structuredContentScore(structured) {
    if (!structured || typeof structured !== 'object') return 0;
    let score = 0;
    const changes = Array.isArray(structured.changes) ? structured.changes.length : 0;
    score += changes * 100;
    if (Number.isInteger(structured.filesWithChanges)) score += 30;
    if (Number.isInteger(structured.insertions)) score += 10;
    if (Number.isInteger(structured.deletions)) score += 10;
    if (String(structured.bodyText || '').trim()) score += 1;
    return score;
}

export function meaningfulBodyScore(text) {
    const src = String(text || '').replace(/\r/g, '');
    if (!src.trim()) return 0;
    const lines = src.split('\n').map(l => l.trim()).filter(Boolean);
    let score = 0;
    for (const line of lines) {
        if (isUiChromeLine(line)) continue;
        if (/^[+-]\d+$/.test(line)) continue;
        if (/^(edited|review changes)$/i.test(line)) continue;
        const len = line.length;
        if (len < 4) continue;
        score += Math.min(len, 120);
        if (/[\p{L}\p{N}]/u.test(line)) score += 10;
    }
    return score;
}

export function isLikelyCodeLine(line) {
    const s = String(line || '').trim();
    if (!s) return false;
    if (/^[+-]\d+$/.test(s)) return true;
    if (/[;{}]/.test(s)) return true;
    if (/^\s*<\/?[a-z][^>]*>\s*$/i.test(s)) return true;
    if (/^\s*(const|let|var|function|if|for|while|return|import|export|class)\b/.test(s)) return true;
    if (/^\s*[.#]?[\w-]+\s*:\s*[^:]+;?\s*$/.test(s)) return true;
    if (/^\s*--[\w-]+\s*:\s*.+;\s*$/.test(s)) return true;
    const symbolCount = (s.match(/[{};=<>\[\]()+*]/g) || []).length;
    if (symbolCount >= 5 && symbolCount > Math.floor(s.length * 0.2)) return true;
    return false;
}

export function extractNarrativeBody(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (const raw of lines) {
        const line = String(raw || '').trim();
        if (!line) {
            out.push('');
            continue;
        }
        if (isUiChromeLine(line)) continue;
        if (/^[+-]\d+$/.test(line)) continue;
        if (/^edited$/i.test(line)) continue;
        if (isLikelyCodeLine(line)) continue;
        out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function selectFinalNarrativeSegment(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/g, ''));
    if (lines.length === 0) return '';
    const nonEmpty = lines.map((l, idx) => ({ line: l.trim(), idx })).filter(x => x.line.length > 0);
    if (nonEmpty.length === 0) return '';

    const answerLike = nonEmpty.filter(x =>
        /[.!?\u3002\uff01\uff1f]$/.test(x.line) ||
        /(created|completed|done|summary|result|files?|directory|implemented|updated)/i.test(x.line)
    );

    const targetIdx = answerLike.length > 0
        ? answerLike[answerLike.length - 1].idx
        : nonEmpty[nonEmpty.length - 1].idx;

    const start = Math.max(0, targetIdx - 30);
    const segment = lines.slice(start).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return segment;
}

export function containsWorkbenchChrome(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return false;
    const patterns = [
        'file\nedit\nselection\nview\ngo\nrun\nterminal\nhelp',
        'agent manager\nactive',
        'open agent manager',
        'ask anything, @ to mention, / for workflows',
        'git graph',
        'ln ',
        ' col ',
        '\ncrlf\n',
        '\nutf-8\n'
    ];
    return patterns.some(p => t.includes(p));
}

export function isLowConfidenceResponse(response) {
    const raw = String(response?.markdown || response?.text || '');
    const sanitized = sanitizeAssistantMarkdown(raw, '');
    const narrative = extractNarrativeBody(sanitized);
    const narrativeScore = meaningfulBodyScore(narrative);
    const messageRoleCount = Number(response?.messageRoleCount || 0);
    const selector = String(response?.selector || '').toLowerCase();
    const lines = narrative
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const highConfidenceSelectors = [
        'antigravity-agent-side-panel',
        'text-ide-message-block-bot-color',
        'bg-ide-chat',
        'agq-chat-message',
        'message.ide'
    ];
    const isHighConfidenceSelector = highConfidenceSelectors.some(s => selector.includes(s));
    if (isHighConfidenceSelector && raw.trim()) return false;

    const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(raw);
    if (hasCjk && lines.length > 0 && lines.length <= 3) return false;

    const naturalLines = lines.filter(l =>
        /[.!?\u3002\uff01\uff1f]/.test(l) ||
        /[\u3040-\u30ff\u3400-\u9fff]/.test(l) ||
        /\b[a-z]{3,}\s+[a-z]{3,}\b/i.test(l)
    ).length;
    const pathLikeLines = lines.filter(l =>
        /^[a-z]:\\/i.test(l) ||
        l.includes('\\') ||
        /^\/[a-z0-9_./-]+/i.test(l) ||
        /\[[^\]]+\]/.test(l)
    ).length;
    const codeLikeLines = lines.filter(l => isLikelyCodeLine(l)).length;
    const progressLikeLines = lines.filter(l =>
        /^(i('| a)m|planning|developing|constructing|finalizing|analyzing)\b/i.test(l)
    ).length;
    const hasFinalSignal = lines.some(l =>
        /(created|completed|directory|files?|summary|result|implemented|updated)/i.test(l)
    );
    const hasChangeSignal =
        /(^|\n)\s*edited(?:\s+[+-]\d+\s+[+-]\d+)?\s*($|\n)/im.test(raw) ||
        /(^|\n)\s*[+-]\d+\s*($|\n)/m.test(raw) ||
        /\b\d+\s+insertions?\s*\(\+\)/i.test(raw) ||
        /\b\d+\s+deletions?\s*\(-\)/i.test(raw);
    const hasRunMarker = /\[run:\d+\]/i.test(raw);
    const signalBacked = hasChangeSignal || (hasRunMarker && hasFinalSignal);
    const startsWithChrome = lines.length > 0 && (
        /^agent manager$/i.test(lines[0]) ||
        /^file$/i.test(lines[0]) ||
        /^edit$/i.test(lines[0])
    );

    if (!raw.trim()) return true;
    if (startsWithChrome) return true;
    if (lines.length >= 8 && naturalLines < 2) return true;
    if (pathLikeLines >= 3 && naturalLines < 4) return true;
    if (codeLikeLines >= 2 && naturalLines < 5) return true;
    if (progressLikeLines >= 3 && !hasFinalSignal) return true;
    if (containsWorkbenchChrome(raw) && narrativeScore < 300 && !signalBacked) return true;
    if (messageRoleCount === 0 && (selector.includes('body') || selector === 'none') && narrativeScore < 500 && !signalBacked) return true;
    return false;
}

export function sanitizeAssistantResponse(rawText, promptText = '') {
    let text = String(rawText || '').replace(/\r/g, '');
    const prompt = String(promptText || '').trim();

    if (prompt && text.includes(prompt)) {
        const idx = text.lastIndexOf(prompt);
        if (idx >= 0) {
            text = text.slice(idx + prompt.length);
        }
    }

    const lines = text
        .split('\n')
        .map(line => line.replace(/\s+$/g, ''))
        .filter(line => {
            const t = line.trim().toLowerCase();
            if (!t) return false;
            if (/^[+-]\d+$/.test(t)) return false;
            if (t === 'edited') return false;
            if (isUiChromeLine(t)) return false;
            return true;
        });

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeAssistantMarkdown(rawText, promptText = '') {
    let text = String(rawText || '').replace(/\r/g, '');
    const prompt = String(promptText || '').trim();

    if (prompt && text.includes(prompt)) {
        const idx = text.lastIndexOf(prompt);
        if (idx >= 0) {
            text = text.slice(idx + prompt.length);
        }
    }

    const lines = text
        .split('\n')
        .map(line => line.replace(/\s+$/g, ''))
        .filter(line => {
            const t = line.trim().toLowerCase();
            if (!t) return true;
            if (/^[+-]\d+$/.test(t)) return false;
            if (t === 'edited') return false;
            if (isUiChromeLine(t)) return false;
            return true;
        });

    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

export function splitForEmbed(text, limit = 3800) {
    const input = String(text || '').trim();
    if (!input) return [];

    const chunks = [];
    let rest = input;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf('\n\n', limit);
        if (cut < Math.floor(limit * 0.6)) cut = rest.lastIndexOf('\n', limit);
        if (cut < Math.floor(limit * 0.6)) cut = rest.lastIndexOf(' ', limit);
        if (cut < 1) cut = limit;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
}

export function clipText(text, max = 12000) {
    const s = String(text || '');
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]`;
}
