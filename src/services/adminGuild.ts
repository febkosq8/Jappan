import type { Client, Guild, GuildBasedChannel, Invite } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits, blockQuote, userMention } from "discord.js";

import { formatChannelMention, formatGuildMention, formatUserMention } from "../helpers/discord.js";
import type { SentGuildMessage } from "../helpers/guildHelper.js";
import { sendGuildMessage } from "../helpers/guildHelper.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";

export interface AdminInvoker {
	userName: string;
	userId: string;
}

export interface KickGuildResult {
	success: boolean;
	departureMessage: SentGuildMessage | null;
}

export function isAdminUser(userId: string, config: Config): boolean {
	return config.ADMIN_USER_IDS.includes(userId);
}

export async function getGuildList(client: Client, config: Config): Promise<EmbedBuilder[]> {
	const guilds = [...client.guilds.cache.values()].sort(
		(first, second) => first.joinedTimestamp - second.joinedTimestamp,
	);
	const totalMembers = guilds.reduce((total, guild) => total + guild.memberCount, 0);
	const totalEmbeds = guilds.length + 1;
	const createFooter = (embedIndex: number) => ({
		text: `Page ${embedIndex + 1} / ${totalEmbeds}`,
	});
	const embeds: EmbedBuilder[] = [
		new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setTitle("Guild summary")
			.addFields(
				{ name: "Total servers", value: String(guilds.length), inline: true },
				{ name: "Total members", value: String(totalMembers), inline: true },
			)
			.setTimestamp()
			.setFooter(createFooter(0)),
	];

	for (const [guildIndex, guild] of guilds.entries()) {
		const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
		const owner = await client.users.fetch(guild.ownerId).catch(() => null);
		const permissions = botMember?.permissions.toArray() ?? [];
		embeds.push(
			new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
				.setTitle(`Guild #${guildIndex + 1}`)
				.addFields(
					{ name: "Guild", value: formatGuildMention(guild) },
					{ name: "Members", value: String(guild.memberCount), inline: true },
					{ name: "Joined", value: `<t:${Math.floor(guild.joinedTimestamp / 1000)}:R>`, inline: true },
					{
						name: "System channel",
						value: guild.systemChannel ? formatChannelMention(guild.systemChannel) : "None",
						inline: true,
					},
					{ name: "Owner", value: owner ? formatUserMention(owner) : userMention(guild.ownerId) },
					{
						name: "Permissions",
						value:
							permissions.length > 0
								? permissions.map((permission) => `\`${permission}\``).join(", ")
								: "None",
					},
				)
				.setTimestamp()
				.setFooter(createFooter(guildIndex + 1)),
		);
	}

	return embeds;
}

export async function getGuildChannel(client: Client, guildId: string, channelId: string): Promise<GuildBasedChannel> {
	const guild = await client.guilds.fetch(guildId).catch(() => null);
	if (!guild) {
		throw new Error("Guild not found.");
	}

	const channel = await guild.channels.fetch(channelId).catch(() => null);
	if (!channel) {
		throw new Error("Channel not found in that guild.");
	}

	return channel;
}

export async function sendGuildAdminMessage({
	guild,
	message,
	config,
	channelId,
	invoker,
}: {
	guild: Guild;
	message: string;
	config: Config;
	channelId?: string;
	invoker?: AdminInvoker;
}): Promise<SentGuildMessage> {
	const embed = new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle(`Message from ${config.BOT_NAME} Admin`)
		.setDescription(message)
		.setTimestamp();
	const sentMessage = await sendGuildMessage({
		guild,
		content: { embeds: [embed] },
		failureMessage: "Failed to send admin message to guild",
		...(channelId ? { channelId } : {}),
		details: { guildId: guild.id, ...(invoker ?? {}) },
	});
	if (!sentMessage) {
		throw new Error("No suitable channel was available in that guild.");
	}
	return sentMessage;
}

export async function kickGuild({
	guild,
	config,
	additionalMessage,
	invoker,
}: {
	guild: Guild;
	config: Config;
	additionalMessage?: string;
	invoker?: AdminInvoker;
}): Promise<KickGuildResult> {
	const departureMessage = await sendGuildAdminMessage({
		guild,
		message: [
			`${config.BOT_NAME} admin's decision has led to the removal of the bot from this server.`,
			`Please [contact the developer](${config.BOT_WEBSITE}) for more information.`,
			additionalMessage ? `Message from admins:\n${blockQuote(additionalMessage)}` : undefined,
		]
			.filter(Boolean)
			.join("\n"),
		config,
		...(invoker ? { invoker } : {}),
	}).catch((error: unknown) => {
		logger.warn("ADMIN", "Could not send guild departure message", { guildId: guild.id, error });
		return null;
	});
	try {
		await guild.leave();
	} catch (error: unknown) {
		logger.error("ADMIN", "Failed to leave guild", {
			guildId: guild.id,
			guildName: guild.name,
			...(invoker ?? {}),
			error,
		});
		return { success: false, departureMessage };
	}
	logger.info("ADMIN", "Bot left guild", {
		guildId: guild.id,
		guildName: guild.name,
		messageChannelId: departureMessage?.channelId,
		messageChannelName: departureMessage?.channelName,
		...(invoker ?? {}),
	});
	return { success: true, departureMessage };
}

export async function getGuildInvite(guild: Guild): Promise<Invite> {
	const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
	if (!botMember) {
		throw new Error("The bot member could not be found in that guild.");
	}

	if (botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
		const invites = await guild.invites.fetch().catch(() => null);
		const existingInvite = invites?.first();
		if (existingInvite) {
			return existingInvite;
		}
	}

	const channels = await guild.channels.fetch().catch(() => null);
	const inviteChannel = [guild.systemChannel, ...(channels?.values() ?? [])].find((channel) => {
		if (!channel || !("createInvite" in channel)) {
			return false;
		}
		const channelPermissions = channel.permissionsFor(botMember);
		return (
			channelPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite]) ?? false
		);
	});
	if (!inviteChannel || !("createInvite" in inviteChannel)) {
		throw new Error("No channel is available where the bot can create an invite.");
	}
	const invite = await inviteChannel
		.createInvite({ maxAge: 12 * 60 * 60, maxUses: 0, unique: false })
		.catch((error: unknown) => {
			logger.warn("ADMIN", "Could not create guild invite", {
				guildId: guild.id,
				channelId: inviteChannel.id,
				error,
			});
			throw new Error("Could not create an invite in that guild.");
		});
	return invite;
}
