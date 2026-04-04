// --- 設定・定数・CLI引数 ---
import './env_loader.js';
export const PORTS = [9500];
export const CDP_CALL_TIMEOUT = 30000;
export const POLLING_INTERVAL = 2000;

const RAW_CLI_ARGS = process.argv.slice(2).map(arg => String(arg || ''));
const CLI_ARGS = new Set(RAW_CLI_ARGS.map(arg => arg.toLowerCase()));

export const RUN_STARTUP_TEST = CLI_ARGS.has('--test');
export const EXIT_AFTER_STARTUP_TEST = RUN_STARTUP_TEST && !CLI_ARGS.has('--test-keepalive');

export function getCliArgValue(flagName) {
    const lower = String(flagName || '').toLowerCase();
    if (!lower) return '';
    for (let i = 0; i < RAW_CLI_ARGS.length; i++) {
        const arg = RAW_CLI_ARGS[i];
        const a = arg.toLowerCase();
        if (a === lower && i + 1 < RAW_CLI_ARGS.length) {
            return String(RAW_CLI_ARGS[i + 1] || '').trim();
        }
        if (a.startsWith(`${lower}=`)) {
            return String(arg.slice(flagName.length + 1) || '').trim();
        }
    }
    return '';
}

export const TEST_CHANNEL_ID = (getCliArgValue('--test-channel') || process.env.DISCORD_TEST_CHANNEL_ID || '').trim();
export const RAW_DUMP_MODE = RUN_STARTUP_TEST
    || CLI_ARGS.has('--raw-dump')
    || ['1', 'true', 'on'].includes((process.env.RAW_RESPONSE_DUMP || '').toLowerCase());
export const RAW_DUMP_FILE = (getCliArgValue('--raw-dump-file') || process.env.RAW_RESPONSE_DUMP_FILE || '').trim();

export const LOG_FILE = 'discord_interaction.log';
export const ALLOWED_DISCORD_USER = (process.env.DISCORD_ALLOWED_USER_ID || '').trim();
export const ALLOWED_DISCORD_USER_IS_ID = /^\d+$/.test(ALLOWED_DISCORD_USER);
export const CHAT_CHANNEL_ID = (process.env.DISCORD_CHAT_CHANNEL_ID || '').trim();
export const FILE_LOG_CHANNEL_ID = (process.env.DISCORD_FILE_LOG_CHANNEL_ID || '').trim();

// セキュリティガード: DISCORD_ALLOWED_USER_ID が未設定の場合は起動を拒否する
if (!ALLOWED_DISCORD_USER) {
    console.error('\x1b[31m[SECURITY ERROR] DISCORD_ALLOWED_USER_ID is not set in .env file.\x1b[0m');
    console.error('Please set your Discord user ID in the .env file:');
    console.error('  DISCORD_ALLOWED_USER_ID=your_user_id_here');
    console.error('');
    console.error('To get your Discord user ID:');
    console.error('  1. Open Discord Settings > Advanced > Enable Developer Mode');
    console.error('  2. Right-click your username > Copy User ID');
    process.exit(1);
}

export const DISCORD_ACTIVITY_LOG_ENABLED = !['0', 'false', 'off'].includes((process.env.DISCORD_ACTIVITY_LOG || 'false').toLowerCase());
export const DISCORD_ACTIVITY_LOG_TYPES = new Set([
    'APPROVAL',
    'ACTION',
    'ERROR'
]);
