import type { Client, Guild, GuildBasedChannel, GuildMember, Invite } from "discord.js";
import {
	ApplicationCommandType,
	ChannelType,
	DiscordAPIError,
	EmbedBuilder,
	PermissionFlagsBits,
	blockQuote,
} from "discord.js";

import { formatChannel, formatGuild, formatUser } from "../helpers/discord.js";
import type { SentGuildMessage } from "../helpers/guildHelper.js";
import { sendGuildMessage } from "../helpers/guildHelper.js";
import GuildModel from "../models/guild.js";
import { getGuildCommands, getRequiredGlobalBotPermissions } from "./commandLoader.js";
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

async function fetchGuildDetails(
	guild: Guild,
	requiredPermissions: ReturnType<typeof getRequiredGlobalBotPermissions>,
) {
	const owner = await guild.client.users.fetch(guild.ownerId);
	const botMember = guild.members.me ?? (await guild.members.fetchMe());

	return {
		id: guild.id,
		name: guild.name,
		isActiveMember: true,
		icon: guild.iconURL(),
		memberCount: guild.memberCount,
		channelCount: guild.channels.cache.size,
		createdAt: guild.createdTimestamp,
		description: guild.description,
		joinedTimestamp: guild.joinedTimestamp,
		systemChannel: guild.systemChannel ? { id: guild.systemChannel.id, name: guild.systemChannel.name } : null,
		permissions: botMember.permissions.toArray(),
		hasRequiredPermissions: botMember.permissions.has(requiredPermissions),
		owner: { userId: owner.id, avatarUrl: owner.displayAvatarURL(), username: owner.username },
	};
}

async function getStoredGuildDetails({
	client,
	guildId,
	guildName,
	requiredPermissions,
}: {
	client: Client;
	guildId: string;
	guildName: string;
	requiredPermissions: ReturnType<typeof getRequiredGlobalBotPermissions>;
}) {
	const guild = client.guilds.cache.get(guildId);
	if (!guild?.available) {
		return { id: guildId, name: guildName, isActiveMember: guild !== undefined };
	}

	return fetchGuildDetails(guild, requiredPermissions);
}

async function getPreferenceChannel(guild: Guild | undefined, channelId: string) {
	if (!guild?.available) return { id: channelId, name: null };

	try {
		const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId));
		return { id: channelId, name: channel?.guildId === guild.id ? channel.name : null };
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && [10003, 50001, 50013].includes(Number(error.code))) {
			return { id: channelId, name: null };
		}
		throw error;
	}
}

async function getPreferenceRole(guild: Guild | undefined, roleId: string | null | undefined) {
	if (!roleId) return null;
	if (!guild?.available) return { id: roleId, name: null };

	try {
		const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
		return { id: roleId, name: role?.name ?? null };
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && [10011, 50001, 50013].includes(Number(error.code))) {
			return { id: roleId, name: null };
		}
		throw error;
	}
}

export async function getAdminGuild(client: Client, guildId: string) {
	const storedGuild = await GuildModel.findOne({ guildId })
		.select({
			_id: 0,
			guildId: 1,
			guildName: 1,
			createdAt: 1,
			auditLog: 1,
			leveling: 1,
			memberAnnouncements: 1,
			warnings: 1,
		})
		.exec();
	if (!storedGuild) {
		return null;
	}
	const details = await getStoredGuildDetails({
		client,
		guildId: storedGuild.guildId,
		guildName: storedGuild.guildName,
		requiredPermissions: getRequiredGlobalBotPermissions(),
	});
	const guild = client.guilds.cache.get(guildId);
	const expectedCommands = getGuildCommands();
	let guildCommandDeployment: { deployed: number; total: number } | null = null;
	if (guild?.available) {
		const registeredCommands = await guild.commands.fetch();
		guildCommandDeployment = {
			deployed: [...expectedCommands.keys()].filter((name) =>
				registeredCommands.some(
					(command) => command.name === name && command.type === ApplicationCommandType.ChatInput,
				),
			).length,
			total: expectedCommands.size,
		};
	}
	const channelIds = [
		storedGuild.auditLog.channelId,
		storedGuild.memberAnnouncements.joinChannelId,
		storedGuild.memberAnnouncements.leaveChannelId,
		storedGuild.warnings.auditChannelId,
	];
	const channels = new Map(
		await Promise.all(
			[...new Set(channelIds.filter((id): id is string => !!id))].map(
				async (id) => [id, await getPreferenceChannel(guild, id)] as const,
			),
		),
	);
	const channelFor = (id: string | null | undefined) => {
		if (!id) return null;
		const channel = channels.get(id);
		if (!channel) throw new Error(`Failed to resolve preference channel ${id}`);
		return channel;
	};
	return {
		...details,
		discoveredAt: storedGuild.createdAt?.getTime() ?? null,
		guildCommandDeployment,
		preferences: {
			auditLog: {
				enabled: storedGuild.auditLog.enabled,
				channel: channelFor(storedGuild.auditLog.channelId),
				fullVerbosity: storedGuild.auditLog.fullVerbosity,
			},
			leveling: {
				enabled: storedGuild.leveling.enabled,
				threshold: storedGuild.leveling.threshold ?? null,
				role: await getPreferenceRole(guild, storedGuild.leveling.roleId),
			},
			memberAnnouncements: {
				joinEnabled: storedGuild.memberAnnouncements.joinEnabled,
				leaveEnabled: storedGuild.memberAnnouncements.leaveEnabled,
				joinChannel: channelFor(storedGuild.memberAnnouncements.joinChannelId),
				leaveChannel: channelFor(storedGuild.memberAnnouncements.leaveChannelId),
			},
			warnings: {
				timeoutThreshold: storedGuild.warnings.timeoutThreshold ?? null,
				timeoutDurationHours: storedGuild.warnings.timeoutDurationHours ?? null,
				banThreshold: storedGuild.warnings.banThreshold ?? null,
				auditChannel: channelFor(storedGuild.warnings.auditChannelId),
			},
		},
	};
}

export async function listAllGuilds(client: Client) {
	const requiredPermissions = getRequiredGlobalBotPermissions();
	const storedGuilds = await GuildModel.find()
		.select({ _id: 0, guildId: 1, guildName: 1 })
		.sort({ guildName: 1, guildId: 1 })
		.lean();

	const guilds = await Promise.all(
		storedGuilds.map(({ guildId, guildName }) =>
			getStoredGuildDetails({ client, guildId, guildName, requiredPermissions }),
		),
	);
	return guilds.sort(
		(first, second) =>
			Number(second.isActiveMember) - Number(first.isActiveMember) || first.name.localeCompare(second.name),
	);
}

export async function getAdminGuildForAction(client: Client, guildId: string) {
	const storedGuild = await GuildModel.exists({ guildId });
	if (!storedGuild) return { status: "not_found" } as const;

	const guild = client.guilds.cache.get(guildId);
	if (!guild) return { status: "not_member" } as const;
	if (!guild.available) return { status: "unavailable" } as const;
	return { status: "ok", guild } as const;
}

export function canSendAdminMessage(channel: GuildBasedChannel, botMember: GuildMember): boolean {
	return (
		channel.isTextBased() &&
		(channel
			.permissionsFor(botMember)
			?.has([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.EmbedLinks,
			]) ??
			false)
	);
}

export async function listAdminGuildChannels(client: Client, guildId: string) {
	const adminGuild = await getAdminGuildForAction(client, guildId);
	if (adminGuild.status !== "ok") return adminGuild;
	const { guild } = adminGuild;

	const botMember = guild.members.me ?? (await guild.members.fetchMe());
	const fetched = await guild.channels.fetch();
	const channels = [...fetched.values()].map((channel) => {
		if (!channel) throw new Error(`Discord returned an unsupported channel type in guild ${guildId}`);
		const parent = channel.parentId ? fetched.get(channel.parentId) : null;
		return {
			id: channel.id,
			name: channel.name,
			type: channel.type,
			typeName: ChannelType[channel.type] ?? `Unknown (${channel.type})`,
			createdAt: channel.createdTimestamp,
			parent: channel.parentId ? { id: channel.parentId, name: parent?.name ?? null } : null,
			position: channel.rawPosition,
			canSendMessage: canSendAdminMessage(channel, botMember),
			...("topic" in channel ? { topic: channel.topic } : {}),
			...("nsfw" in channel ? { nsfw: channel.nsfw } : {}),
			...("rateLimitPerUser" in channel ? { rateLimitPerUser: channel.rateLimitPerUser } : {}),
			...("bitrate" in channel ? { bitrate: channel.bitrate } : {}),
			...("userLimit" in channel ? { userLimit: channel.userLimit } : {}),
		};
	});
	const comparePosition = (first: (typeof channels)[number], second: (typeof channels)[number]) =>
		first.position - second.position || first.id.localeCompare(second.id);
	const categories = channels.filter((channel) => channel.type === ChannelType.GuildCategory).sort(comparePosition);
	const childrenByParent = new Map<string, typeof channels>();
	const uncategorized: typeof channels = [];
	for (const channel of channels) {
		if (channel.type === ChannelType.GuildCategory) continue;
		if (!channel.parent) {
			uncategorized.push(channel);
			continue;
		}
		const siblings = childrenByParent.get(channel.parent.id) ?? [];
		siblings.push(channel);
		childrenByParent.set(channel.parent.id, siblings);
	}
	const ordered = uncategorized.sort(comparePosition);
	for (const category of categories) {
		ordered.push(category, ...(childrenByParent.get(category.id) ?? []).sort(comparePosition));
		childrenByParent.delete(category.id);
	}
	for (const parentId of [...childrenByParent.keys()].sort()) {
		ordered.push(...(childrenByParent.get(parentId) ?? []).sort(comparePosition));
	}
	return { status: "ok", channels: ordered } as const;
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
	channelId,
	invoker,
}: {
	guild: Guild;
	config: Config;
	additionalMessage?: string;
	channelId?: string | null;
	invoker?: AdminInvoker;
}): Promise<KickGuildResult> {
	const departureMessage =
		channelId === null
			? null
			: await sendGuildAdminMessage({
					guild,
					message: [
						`${config.BOT_NAME} admin's decision has led to the removal of the bot from this server.`,
						`Please [contact the developer](${config.BOT_WEBSITE}) for more information.`,
						additionalMessage ? `Message from admins:\n${blockQuote(additionalMessage)}` : undefined,
					]
						.filter(Boolean)
						.join("\n"),
					config,
					...(channelId ? { channelId } : {}),
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
