import fs from 'fs';

const LOG_FILE = 'discord_interaction.log';

const COLORS = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

export function setTitle(status) {
    process.stdout.write(String.fromCharCode(27) + "]0;Antigravity Bot: " + status + String.fromCharCode(7));
}

export function logInteraction(type, content) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${content}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);

    let color = COLORS.reset;
    let icon = "";

    switch (type) {
        case 'INJECT':
        case 'SUCCESS':
            color = COLORS.green;
            icon = "✅ ";
            break;
        case 'ERROR':
            color = COLORS.red;
            icon = "❌ ";
            break;
        case 'generating':
            color = COLORS.yellow;
            icon = "🤔 ";
            break;
        case 'CDP':
            color = COLORS.cyan;
            icon = "🔌 ";
            break;
        default:
            color = COLORS.reset;
    }

    console.log(`${color}[${type}] ${icon}${content}${COLORS.reset}`);

    if (type === 'CDP' && content.includes('Connected')) setTitle("🟢 Connected");
    if (type === 'CDP' && content.includes('disconnected')) setTitle("🔴 Disconnected");
    if (type === 'generating') setTitle("🟡 Generating...");
    if (type === 'SUCCESS' || (type === 'INJECT' && !content.includes('failed'))) setTitle("🟢 Connected");
}
