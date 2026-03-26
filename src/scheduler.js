// --- スケジューラモジュール ---
// node-cron ベースの定期実行管理
// ジョブは data/jobs/*.json に1ジョブ1ファイルで管理

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import chokidar from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = path.join(__dirname, '..', 'data', 'jobs');

/** @type {Map<string, { job: import('node-cron').ScheduledTask, meta: JobMeta }>} */
// key = ファイル名（拡張子なし）
const activeJobs = new Map();

/**
 * @typedef {Object} JobMeta
 * @property {string}  name     - ジョブ名（ファイル名）
 * @property {string}  cron     - cron 式（JST）
 * @property {string}  message  - Antigravity に送るメッセージ
 * @property {boolean} active   - false の場合はスキップ
 */

// --- コールバック ---

let _triggerCallback = null;

export function setScheduleTrigger(cb) {
    _triggerCallback = cb;
}

// --- ファイル操作 ---

function ensureJobsDir() {
    if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function readJobFile(filePath) {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const name = path.basename(filePath, '.json');
        return { name, ...raw };
    } catch {
        return null;
    }
}

function allJobFiles() {
    ensureJobsDir();
    return fs.readdirSync(JOBS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(JOBS_DIR, f));
}

function jobFilePath(name) {
    return path.join(JOBS_DIR, `${name}.json`);
}

function nextAutoName() {
    ensureJobsDir();
    const existing = fs.readdirSync(JOBS_DIR)
        .filter(f => f.match(/^job-\d+\.json$/))
        .map(f => parseInt(f.replace('job-', '').replace('.json', '')))
        .filter(n => !isNaN(n));
    const max = existing.length > 0 ? Math.max(...existing) : 0;
    return `job-${max + 1}`;
}

// --- cron タスク管理 ---

function startCronTask(meta) {
    if (!meta || !meta.cron || meta.active === false) return;
    if (!cron.validate(meta.cron)) {
        console.warn(`[SCHEDULER] Invalid cron for "${meta.name}": "${meta.cron}"`);
        return;
    }

    // 既存タスクがあれば停止して差し替え
    const existing = activeJobs.get(meta.name);
    if (existing) {
        existing.job.stop();
    }

    const task = cron.schedule(meta.cron, async () => {
        console.log(`[SCHEDULER] Triggering "${meta.name}": "${meta.message}"`);
        if (_triggerCallback) {
            try {
                await _triggerCallback(meta);
            } catch (e) {
                console.error(`[SCHEDULER] "${meta.name}" callback error:`, e.message);
            }
        }
    }, { timezone: 'Asia/Tokyo' });

    activeJobs.set(meta.name, { job: task, meta });
    console.log(`[SCHEDULER] Registered "${meta.name}" (${meta.cron})`);
}

function stopCronTask(name) {
    const entry = activeJobs.get(name);
    if (entry) {
        entry.job.stop();
        activeJobs.delete(name);
        console.log(`[SCHEDULER] Stopped "${name}"`);
    }
}

// --- Chokidar ウォッチャー ---

let _watcher = null;

function startWatcher() {
    ensureJobsDir();
    _watcher = chokidar.watch(JOBS_DIR, {
        persistent: true,
        ignoreInitial: true,   // 初期ロードは restoreJobs() で行う
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    _watcher.on('add', filePath => {
        if (!filePath.endsWith('.json')) return;
        const meta = readJobFile(filePath);
        if (meta) {
            console.log(`[SCHEDULER] File added: ${path.basename(filePath)}`);
            startCronTask(meta);
        }
    });

    _watcher.on('change', filePath => {
        if (!filePath.endsWith('.json')) return;
        const name = path.basename(filePath, '.json');
        const meta = readJobFile(filePath);
        if (meta) {
            console.log(`[SCHEDULER] File changed: ${path.basename(filePath)}`);
            if (meta.active === false) {
                stopCronTask(name);
            } else {
                startCronTask(meta);
            }
        }
    });

    _watcher.on('unlink', filePath => {
        if (!filePath.endsWith('.json')) return;
        const name = path.basename(filePath, '.json');
        console.log(`[SCHEDULER] File removed: ${path.basename(filePath)}`);
        stopCronTask(name);
    });
}

// --- 公開 API ---

/**
 * ジョブを追加する（Discord /schedule add 用）。
 */
export function addJob(cronExpr, message, name = null) {
    if (!cron.validate(cronExpr)) {
        return { success: false, error: `Invalid cron: \`${cronExpr}\`` };
    }

    ensureJobsDir();
    const jobName = name || nextAutoName();
    const filePath = jobFilePath(jobName);

    if (fs.existsSync(filePath)) {
        return { success: false, error: `Job "${jobName}" already exists.` };
    }

    const content = { cron: cronExpr, message, active: true };
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    // Chokidar が add イベントを拾って startCronTask する

    return { success: true, meta: { name: jobName, ...content } };
}

/**
 * ジョブを名前で削除する。
 */
export function removeJobByName(name) {
    const filePath = jobFilePath(name);
    if (!fs.existsSync(filePath)) {
        return { success: false, error: `Job "${name}" not found.` };
    }
    const meta = readJobFile(filePath);
    fs.unlinkSync(filePath);
    // Chokidar が unlink イベントを拾って stopCronTask する
    return { success: true, removed: meta };
}

/**
 * ジョブを番号（リスト順）で削除する。
 */
export function removeJobByNumber(number) {
    const jobs = listJobs();
    if (number < 1 || number > jobs.length) {
        return { success: false, error: `Job #${number} not found.` };
    }
    return removeJobByName(jobs[number - 1].name);
}

/**
 * 登録済みジョブ一覧を返す（ファイル名順）。
 */
export function listJobs() {
    return allJobFiles()
        .map(readJobFile)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Bot 起動時に呼ぶ。全ジョブを復元してウォッチャーを起動する。
 */
export function restoreJobs() {
    const files = allJobFiles();
    let restored = 0;
    for (const filePath of files) {
        const meta = readJobFile(filePath);
        if (meta && meta.active !== false) {
            startCronTask(meta);
            restored++;
        }
    }
    if (restored > 0) {
        console.log(`[SCHEDULER] Restored ${restored} job(s).`);
    }
    startWatcher();
}

/**
 * 全タスク停止（シャットダウン用）。
 */
export function stopAllJobs() {
    if (_watcher) {
        _watcher.close();
        _watcher = null;
    }
    for (const [, entry] of activeJobs) {
        entry.job.stop();
    }
    activeJobs.clear();
}
