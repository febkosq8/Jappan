import type { Client, Guild, GuildBasedChannel, Invite } from "discord.js";
import { DiscordAPIError, EmbedBuilder, PermissionFlagsBits, blockQuote, userMention } from "discord.js";

import {
	formatChannel,
	formatChannelMention,
	formatGuild,
	formatGuildMention,
	formatUser,
	formatUserMention,
} from "../helpers/discord.js";
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

export async function validateAdminUsers(client: Client, config: Config): Promise<void> {
	if (config.ADMIN_USER_IDS.length === 0) {
		return;
	}

	let validCount = 0;
	let invalidCount = 0;
	let unverifiedCount = 0;

	for (const userId of config.ADMIN_USER_IDS) {
		if (!/^\d{17,20}$/u.test(userId)) {
			invalidCount += 1;
			logger.warn("ADMIN", "Configured admin user ID has an invalid format", { userId });
			continue;
		}

		try {
			const user = await client.users.fetch(userId, { force: true });
			validCount += 1;
			logger.success("ADMIN", "Configured admin user verified", { user: formatUser(user) });
		} catch (error: unknown) {
			if (error instanceof DiscordAPIError && error.code === 10013) {
				invalidCount += 1;
				logger.warn("ADMIN", "Configured admin user does not exist", { userId });
				continue;
			}

			unverifiedCount += 1;
			logger.error("ADMIN", "Could not verify configured admin user with Discord", { userId, error });
		}
	}

	logger.info("ADMIN", "Admin user validation completed", {
		total: config.ADMIN_USER_IDS.length,
		valid: validCount,
		invalid: invalidCount,
		unverified: unverifiedCount,
	});

	if (invalidCount > 0 || unverifiedCount > 0) {
		throw new Error(
			`Admin user validation failed: ${invalidCount} invalid and ${unverifiedCount} could not be verified`,
		);
	}
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

			.setFooter(createFooter(0))
			.setTimestamp(),
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

				.setFooter(createFooter(guildIndex + 1))
				.setTimestamp(),
		);
	}

	return embeds;
}

export async function getGuildChannel({
	client,
	guildId,
	channelId,
}: {
	client: Client;
	guildId: string;
	channelId: string;
}): Promise<GuildBasedChannel> {
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
		details: {
			guild: formatGuild(guild),
			...(invoker ? { user: `${invoker.userName} <${invoker.userId}>` } : {}),
		},
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
		logger.warn("ADMIN", "Could not send guild departure message", {
			guild: formatGuild(guild),
			error,
		});
		return null;
	});
	try {
		await guild.leave();
	} catch (error: unknown) {
		logger.error("ADMIN", "Failed to leave guild", {
			user: invoker ? `${invoker.userName} <${invoker.userId}>` : undefined,
			guild: formatGuild(guild),
			error,
		});
		return { success: false, departureMessage };
	}
	logger.info("ADMIN", "Bot left guild", {
		user: invoker ? `${invoker.userName} <${invoker.userId}>` : undefined,
		guild: formatGuild(guild),
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
				guild: formatGuild(guild),
				channel: formatChannel(inviteChannel),
				error,
			});
			throw new Error("Could not create an invite in that guild.");
		});
	return invite;
}
