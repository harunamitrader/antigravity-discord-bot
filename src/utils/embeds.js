import { EmbedBuilder } from 'discord.js';

export function createSuccessEmbed(title, description = '') {
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`✅ ${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

export function createErrorEmbed(title, description = '') {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`❌ ${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

export function createInfoEmbed(title, description = '') {
    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`ℹ️ ${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

export function createProgressEmbed(title, description = '') {
    const embed = new EmbedBuilder()
        .setColor('#FFFF00')
        .setTitle(`⏳ ${title}`);
    if (description) embed.setDescription(description);
    return embed;
}
