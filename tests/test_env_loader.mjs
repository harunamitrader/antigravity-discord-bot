import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOCK1 = path.join(ROOT_DIR, 'bot1.lock');
const LOCK2 = path.join(ROOT_DIR, 'bot2.lock');
const ENV1 = path.join(ROOT_DIR, '.env');
const ENV2 = path.join(ROOT_DIR, '.env.bot2');

const EXAMPLE_ENV = path.join(ROOT_DIR, '.env.example');
const EXAMPLE_BAK = path.join(ROOT_DIR, '.env.example.bak');

// Cleanup function before/after tests
function cleanup() {
    [LOCK1, LOCK2, ENV1, ENV2].forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });
}

function hideExampleEnv() {
    if (fs.existsSync(EXAMPLE_ENV)) {
        fs.renameSync(EXAMPLE_ENV, EXAMPLE_BAK);
    }
}

function restoreExampleEnv() {
    if (fs.existsSync(EXAMPLE_BAK)) {
        fs.renameSync(EXAMPLE_BAK, EXAMPLE_ENV);
    }
}

function runLoader() {
    // Run a script that imports env_loader to see what it does
    const script = `
        import fs from 'fs';
        import path from 'path';
        import { fileURLToPath } from 'url';
        import './src/env_loader.js';
        
        console.log(process.env.TEST_VAR_BOT_ID);
        
        // Wait briefly so lock check can be performed by the main test process
        // since env_loader's process.on('exit') might clean it up too fast.
        setTimeout(() => {}, 2000);
    `;
    const tempScript = path.join(ROOT_DIR, 'temp_run_loader.js');
    fs.writeFileSync(tempScript, script);

    // We run it as a child process but don't wait for 2000ms. We just spawn it, check, and kill.
    const child = spawnSync('node', ['temp_run_loader.js'], { cwd: ROOT_DIR, encoding: 'utf8', timeout: 500 });

    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript);

    return {
        stderr: child.stderr,
        stdout: child.stdout,
        status: child.status,
    };
}

async function runTests() {
    console.log("Starting env_loader tests...");
    hideExampleEnv();

    try {
        // Test 1: No env files => Error
        cleanup();
        console.log("Test 1: No env files (Should fail)");
        let res = runLoader();
        if (res.status === 0 || (!res.stderr.includes('Exiting') && !res.stdout.includes('Exiting'))) {
            console.error("❌ Test 1 failed. Expected exit due to missing .env files.");
            console.error("STDOUT:", res.stdout);
            console.error("STDERR:", res.stderr);
            process.exit(1);
        }
        console.log("✅ Test 1 passed.");

        // Setup basic env files
        fs.writeFileSync(ENV1, 'TEST_VAR_BOT_ID=bot1\n');
        fs.writeFileSync(ENV2, 'TEST_VAR_BOT_ID=bot2\n');

        // Test 2: Normal startup (Primary slot free)
        cleanup();
        fs.writeFileSync(ENV1, 'TEST_VAR_BOT_ID=bot1\n');
        fs.writeFileSync(ENV2, 'TEST_VAR_BOT_ID=bot2\n');
        console.log("\nTest 2: Normal startup");
        res = runLoader();
        if (!res.stdout.includes('bot1')) {
            console.error("❌ Test 2 failed. Expected bot1 to be loaded.");
            console.error({ out: res.stdout, err: res.stderr });
            process.exit(1);
        }
        if (!fs.existsSync(LOCK1)) {
            console.error("❌ Test 2 failed. lock file not created.");
            process.exit(1);
        }
        console.log("✅ Test 2 passed.");

        // Test 3: Primary slot occupied by fake PID
        console.log("\nTest 3: Primary slot occupied by *dead* PID (Should reuse primary)");
        cleanup();
        fs.writeFileSync(ENV1, 'TEST_VAR_BOT_ID=bot1\n');
        fs.writeFileSync(ENV2, 'TEST_VAR_BOT_ID=bot2\n');
        fs.writeFileSync(LOCK1, '99999999'); // Assuming this PID doesn't exist
        res = runLoader();
        if (!res.stdout.includes('bot1')) {
            console.error("❌ Test 3 failed. Expected dead lock to be ignored and bot1 to load.");
            process.exit(1);
        }
        console.log("✅ Test 3 passed.");

        // Test 4: Primary slot occupied by REAL PID (Fallback to bot2)
        console.log("\nTest 4: Primary slot occupied by *alive* PID (Should fallback to secondary)");
        cleanup();
        fs.writeFileSync(ENV1, 'TEST_VAR_BOT_ID=bot1\n');
        fs.writeFileSync(ENV2, 'TEST_VAR_BOT_ID=bot2\n');

        // We use our own PID as the "alive" process
        fs.writeFileSync(LOCK1, process.pid.toString());
        res = runLoader();
        if (!res.stdout.includes('bot2')) {
            console.error("❌ Test 4 failed. Expected fallback to bot2.");
            console.error({ out: res.stdout, err: res.stderr });
            process.exit(1);
        }
        if (!fs.existsSync(LOCK2)) {
            console.error("❌ Test 4 failed. bot2 lock file not created.");
            process.exit(1);
        }
        console.log("✅ Test 4 passed.");

        // Test 5: Both slots occupied by REAL PIDs (Error)
        console.log("\nTest 5: Both slots occupied by *alive* PIDs (Should error)");
        cleanup();
        fs.writeFileSync(ENV1, 'TEST_VAR_BOT_ID=bot1\n');
        fs.writeFileSync(ENV2, 'TEST_VAR_BOT_ID=bot2\n');
        fs.writeFileSync(LOCK1, process.pid.toString());
        fs.writeFileSync(LOCK2, process.pid.toString());
        res = runLoader();
        if (res.status === 0 || !res.stderr.includes('Cannot start a third instance')) {
            console.error("❌ Test 5 failed. Expected error when both slots occupied.");
            process.exit(1);
        }
        console.log("✅ Test 5 passed.");

        cleanup();
        console.log("\n🎉 All tests passed!");
    } finally {
        restoreExampleEnv();
    }
}

runTests();
