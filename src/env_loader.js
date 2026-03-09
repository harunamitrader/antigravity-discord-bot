import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function isProcessAlive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function loadEnvWithLock() {
    const lock1Path = path.join(ROOT_DIR, 'bot1.lock');
    const lock2Path = path.join(ROOT_DIR, 'bot2.lock');
    const env1Path = path.join(ROOT_DIR, '.env');
    const env2Path = path.join(ROOT_DIR, '.env.bot2');

    let loadedEnvPath = null;
    let lockFileToUse = null;

    // Check bot1
    let bot1Alive = false;
    if (fs.existsSync(lock1Path)) {
        const pid1 = parseInt(fs.readFileSync(lock1Path, 'utf8').trim(), 10);
        bot1Alive = isProcessAlive(pid1);
    }

    if (!bot1Alive) {
        // Can use bot1 slot
        loadedEnvPath = env1Path;
        lockFileToUse = lock1Path;
        console.log(`[ENV] Primary slot available. Loading ${env1Path}...`);
    } else {
        // Check bot2 slot
        let bot2Alive = false;
        if (fs.existsSync(lock2Path)) {
            const pid2 = parseInt(fs.readFileSync(lock2Path, 'utf8').trim(), 10);
            bot2Alive = isProcessAlive(pid2);
        }

        if (!bot2Alive) {
            loadedEnvPath = env2Path;
            lockFileToUse = lock2Path;
            console.log(`[ENV] Primary slot in use. Fallback to Secondary slot. Loading ${env2Path}...`);
        } else {
            console.error('[ENV] ERROR: Both bot1 and bot2 slots are currently in use. Cannot start a third instance.');
            process.exit(1);
        }
    }

    if (!fs.existsSync(loadedEnvPath)) {
        console.warn(`[ENV] Warning: Environment file not found at ${loadedEnvPath}.`);
        const envExample = path.join(ROOT_DIR, '.env.example');
        if (fs.existsSync(envExample)) {
            try {
                fs.copyFileSync(envExample, loadedEnvPath);
                console.log(`[ENV] Created ${loadedEnvPath} from .env.example. Please configure it and restart.`);
            } catch (e) {
                console.error(`[ENV] Failed to copy .env.example to ${loadedEnvPath}:`, e);
            }
        } else {
            console.error(`[ENV] No ${loadedEnvPath} and no .env.example found. Exiting.`);
        }
        process.exit(1);
    }

    // Load the selected env file
    dotenv.config({ path: loadedEnvPath });

    // Write the lock file with our PID
    fs.writeFileSync(lockFileToUse, process.pid.toString(), 'utf8');

    // Attempt to clean up the lock file on normal exit (though the PID check handles crashes)
    const cleanup = () => {
        try {
            if (fs.existsSync(lockFileToUse)) {
                fs.unlinkSync(lockFileToUse);
            }
        } catch (e) {
            console.error(`[ENV] Failed to clean up lock file ${lockFileToUse}:`, e);
        }
    };

    process.on('exit', () => {
        cleanup();
    });

    console.log(`[ENV] Successfully loaded environment from ${path.basename(loadedEnvPath)} (PID: ${process.pid})`);
}

// Execute immediately upon import
loadEnvWithLock();
