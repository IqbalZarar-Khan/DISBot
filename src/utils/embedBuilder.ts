import { EmbedBuilder } from 'discord.js';
import { getTierColor, getTierEmoji } from './tierRanking';

interface PostAlertData {
    title: string;
    url: string;
    tierName: string;
    tags?: string[];
    collections?: string[];
    isUpdate?: boolean;
}

interface MemberAlertData {
    fullName: string;
    tierName: string;
    isUpgrade?: boolean;
}

/**
 * Create a rich embed for post alerts
 */
export function createPostEmbed(data: PostAlertData): EmbedBuilder {
    const emoji = getTierEmoji(data.tierName);
    const color = getTierColor(data.tierName);

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${data.title}`)
        .setURL(data.url)
        .setColor(color)
        .setTimestamp();

    if (data.isUpdate) {
        embed.setDescription(`✨ **Update:** This chapter is now available for **${data.tierName}** members!`);
    } else {
        embed.setDescription(`🆕 **New chapter available for ${data.tierName} members!**`);
    }

    // Add collections if present
    if (data.collections && data.collections.length > 0) {
        embed.addFields({
            name: '📚 Collections',
            value: data.collections.join(', '),
            inline: true
        });
    }

    // Add tags if present
    if (data.tags && data.tags.length > 0) {
        embed.addFields({
            name: '🏷️ Tags',
            value: data.tags.map(tag => `#${tag}`).join(', '),
            inline: true
        });
    }

    return embed;
}

/**
 * Create a rich embed for member alerts
 */
export function createMemberEmbed(data: MemberAlertData): EmbedBuilder {
    const emoji = getTierEmoji(data.tierName);
    const color = getTierColor(data.tierName);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTimestamp();

    if (data.isUpgrade) {
        embed
            .setTitle('📈 Member Upgrade!')
            .setDescription(`**${data.fullName}** just upgraded to **${emoji} ${data.tierName}**! Welcome to the inner circle.`);
    } else {
        embed
            .setTitle('🎉 New Member!')
            .setDescription(`**${data.fullName}** has pledged to the **${emoji} ${data.tierName}** tier!`);
    }

    import { EmbedBuilder } from 'discord.js';
    import { getTierColor, getTierEmoji } from './tierRanking';

    interface PostAlertData {
        title: string;
        url: string;
        tierName: string;
        tags?: string[];
        collections?: string[];
        isUpdate?: boolean;
    }

    interface MemberAlertData {
        fullName: string;
        tierName: string;
        isUpgrade?: boolean;
    }

    /**
     * Create a rich embed for post alerts
     */
    export function createPostEmbed(
        title: string,
        url: string,
        tierName: string,
        tags?: string[],
        collection?: string
    ): EmbedBuilder {
        // Assuming getTierVisuals is a new function that combines getTierColor and getTierEmoji
        // For this change, we'll assume it exists or needs to be created elsewhere.
        // If not, this will cause a compilation error.
        const getTierVisuals = (tier: string) => ({
            color: getTierColor(tier),
            emoji: getTierEmoji(tier)
        });
        const { color, emoji } = getTierVisuals(tierName);

        const embed = new EmbedBuilder()
            .setTitle(`${emoji} New Chapter Available: ${title}`)
            .setColor(color)
            .setDescription(`This chapter is now available for **${tierName}** tier patrons!`)
            .setTimestamp();

        // Only set URL if it's valid
        if (url && url.startsWith('http')) {
            embed.setURL(url);
        }

        if (tags && tags.length > 0) {
            embed.addFields({ name: '🏷️ Tags', value: tags.join(', '), inline: true });
        }

        if (collection) {
            embed.addFields({ name: '📚 Collection', value: collection, inline: true });
        }

        return embed;
    }

    /**
     * Create a rich embed for member alerts
     */
    export function createMemberEmbed(data: MemberAlertData): EmbedBuilder {
        const emoji = getTierEmoji(data.tierName);
        const color = getTierColor(data.tierName);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp();

        if (data.isUpgrade) {
            embed
                .setTitle('📈 Member Upgrade!')
                .setDescription(`**${data.fullName}** just upgraded to **${emoji} ${data.tierName}**! Welcome to the inner circle.`);
        } else {
            embed
                .setTitle('🎉 New Member!')
                .setDescription(`**${data.fullName}** has pledged to the **${emoji} ${data.tierName}** tier!`);
        }

        return embed;
    }

    /**
     * Create a test alert embed
     */
    export function createTestEmbed(tierName: string): EmbedBuilder {
        const emoji = getTierEmoji(tierName);
        const color = getTierColor(tierName);

        return new EmbedBuilder()
            .setTitle(`${emoji} Test Alert for ${tierName}`)
            .setDescription('This is a test alert to verify channel permissions and formatting.')
            .setColor(color)
            .addFields(
                { name: 'Status', value: '✅ Working correctly', inline: true },
                { name: 'Tier', value: tierName, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Patreon Tier-Waterfall Bot' });
    }
