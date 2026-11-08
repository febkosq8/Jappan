import type { Guild, GuildMember, Invite, Role } from "discord.js";
import { ChannelType, EmbedBuilder, PermissionFlagsBits, blockQuote } from "discord.js";

import { formatChannel, formatGuild } from "./discord.js";
import type { SentGuildMessage } from "./guild.js";
import {
	beginGuildDeparture,
	canSendMessage,
	cancelGuildDeparture,
	getAdminGuildForAction,
	getGuild,
	getGuilds,
	sendGuildMessage,
} from "./guild.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";

export interface AdminInvoker {
	userName: string;
	userId: string;
}

export interface KickGuildResult {
	success: boolean;
	departureMessage: SentGuildMessage | null;
}

export async function listAdminGuildChannels(guildId: string) {
	const adminGuild = await getAdminGuildForAction(guildId);
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
			canSendMessage: canSendMessage({
				channel,
				botMember,
				permissions: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.EmbedLinks,
				],
			}),
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

export async function listAdminGuildRoles(guildId: string) {
	const adminGuild = await getAdminGuildForAction(guildId);
	if (adminGuild.status !== "ok") return adminGuild;
	const { guild } = adminGuild;

	const botMember = guild.members.me ?? (await guild.members.fetchMe());
	const canManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
	const fetched = await guild.roles.fetch();
	const roles = [...fetched.values()]
		.sort((first, second) => second.position - first.position || first.id.localeCompare(second.id))
		.map((role) => ({
			id: role.id,
			name: role.name,
			position: role.position,
			managed: role.managed,
			assignable: canAssignRole(role, botMember, canManageRoles),
		}));
	return { status: "ok", roles } as const;
}

export function canAssignRole(role: Role, botMember: GuildMember, canManageRoles: boolean): boolean {
	return (
		canManageRoles &&
		role.id !== role.guild.id &&
		!role.managed &&
		botMember.roles.highest.comparePositionTo(role) > 0
	);
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
	if (!beginGuildDeparture(guild)) {
		logger.warn("ADMIN", "Skipped guild departure because the guild is unavailable or already leaving", {
			guild: formatGuild(guild),
		});
		return { success: false, departureMessage: null };
	}
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
		cancelGuildDeparture(guild);
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

export async function selfKickGuilds({
	config,
	additionalMessage,
	invoker,
	deadlineAt,
}: {
	config: Config;
	additionalMessage?: string;
	invoker: AdminInvoker;
	deadlineAt: number;
}): Promise<{
	protectedGuild: { id: string; name: string } | null;
	leftGuilds: { id: string; name: string; messageSent: boolean }[];
	failedGuilds: { id: string; name: string; messageSent: boolean }[];
	timeLimitReached: boolean;
}> {
	const protectedGuild = config.PLAYER_HEALTH_CHECK_GUILD_ID
		? getGuild({ source: "discord", guildId: config.PLAYER_HEALTH_CHECK_GUILD_ID })
		: undefined;
	const guilds = getGuilds({ source: "discord" }).filter((guild) => guild.id !== protectedGuild?.id);
	const leftGuilds: { id: string; name: string; messageSent: boolean }[] = [];
	const failedGuilds: { id: string; name: string; messageSent: boolean }[] = [];
	let timeLimitReached = false;

	for (const guild of guilds) {
		if (Date.now() >= deadlineAt) {
			timeLimitReached = true;
			break;
		}
		try {
			const result = await kickGuild({
				guild,
				config,
				invoker,
				...(additionalMessage ? { additionalMessage } : {}),
			});
			const entry = { id: guild.id, name: guild.name, messageSent: result.departureMessage !== null };
			(result.success ? leftGuilds : failedGuilds).push(entry);
		} catch (error: unknown) {
			logger.error("ADMIN", "Failed to process guild during dashboard self-kick", {
				user: `${invoker.userName} <${invoker.userId}>`,
				guild: formatGuild(guild),
				error,
			});
			failedGuilds.push({ id: guild.id, name: guild.name, messageSent: false });
		}
	}

	return {
		protectedGuild: protectedGuild ? { id: protectedGuild.id, name: protectedGuild.name } : null,
		leftGuilds,
		failedGuilds,
		timeLimitReached,
	};
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
