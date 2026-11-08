import type { Client, Guild, PermissionResolvable } from "discord.js";
import { ApplicationCommandType, DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

import { formatUser } from "../helpers/discord.js";
import { getGuild, getGuilds } from "../helpers/guild.js";
import type { Guild as StoredGuild } from "../models/guild.js";
import { getGuildCommands, getRequiredGlobalBotPermissions } from "./commandLoader.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";

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

async function getStoredGuildDetails({
	guildId,
	guildName,
	requiredPermissions,
	keys,
}: {
	guildId: string;
	guildName: string;
	requiredPermissions: ReturnType<typeof getRequiredGlobalBotPermissions> | undefined;
	keys: readonly (typeof adminGuildListKeys)[number][];
}) {
	const includeGuildCommandsState = keys.includes("guildCommandDeploymentState");
	const guild = getGuild({ source: "discord", guildId });
	if (!guild?.available) {
		return {
			id: guildId,
			name: guildName,
			isActiveMember: guild !== undefined,
			...(includeGuildCommandsState ? { guildCommandDeploymentState: null } : {}),
		};
	}

	const owner = keys.includes("owner") ? await guild.client.users.fetch(guild.ownerId) : undefined;
	const botMember =
		keys.includes("permissions") || keys.includes("hasRequiredPermissions")
			? (guild.members.me ?? (await guild.members.fetchMe()))
			: undefined;
	let guildCommandDeploymentState: { deployed: number; total: number } | undefined;
	if (includeGuildCommandsState) {
		const expectedCommands = getGuildCommands();
		const registeredCommands = await guild.commands.fetch();
		guildCommandDeploymentState = {
			deployed: [...expectedCommands.keys()].filter((name) =>
				registeredCommands.some(
					(command) => command.name === name && command.type === ApplicationCommandType.ChatInput,
				),
			).length,
			total: expectedCommands.size,
		};
	}

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
		...(botMember ? { permissions: botMember.permissions.toArray() } : {}),
		...(botMember && requiredPermissions
			? { hasRequiredPermissions: botMember.permissions.has(requiredPermissions) }
			: {}),
		...(owner
			? { owner: { userId: owner.id, avatarUrl: owner.displayAvatarURL(), username: owner.username } }
			: {}),
		...(guildCommandDeploymentState !== undefined ? { guildCommandDeploymentState } : {}),
	};
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

type StoredGuildPreferences = Pick<StoredGuild, "auditLog" | "leveling" | "memberAnnouncements" | "warnings">;

async function resolveGuildPreferences(guild: Guild | undefined, storedGuild: StoredGuildPreferences) {
	const channelIds = [
		storedGuild.auditLog.channelId,
		storedGuild.memberAnnouncements.joinChannelId,
		storedGuild.memberAnnouncements.leaveChannelId,
		storedGuild.warnings.auditChannelId,
	];
	const channels = new Map<string, Awaited<ReturnType<typeof getPreferenceChannel>>>();
	for (const id of new Set(channelIds.filter((id): id is string => !!id))) {
		channels.set(id, await getPreferenceChannel(guild, id));
	}
	const channelFor = (id: string | null | undefined) => {
		if (!id) return null;
		const channel = channels.get(id);
		if (!channel) throw new Error(`Failed to resolve preference channel ${id}`);
		return channel;
	};
	return {
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
	};
}

export async function getAdminGuild({
	guildId,
	includeGuildCommandsState,
}: {
	guildId: string;
	includeGuildCommandsState: boolean;
}) {
	const storedGuild = await getGuild({ source: "database", guildId });
	if (!storedGuild) {
		return null;
	}
	const details = await getStoredGuildDetails({
		guildId: storedGuild.guildId,
		guildName: storedGuild.guildName,
		requiredPermissions: getRequiredGlobalBotPermissions(),
		keys: includeGuildCommandsState
			? adminGuildListKeys
			: adminGuildListKeys.filter((key) => key !== "guildCommandDeploymentState"),
	});
	const guild = getGuild({ source: "discord", guildId });
	return {
		...details,
		discoveredAt: storedGuild.createdAt?.getTime() ?? null,
		preferences: await resolveGuildPreferences(guild, storedGuild),
	};
}

type GuildListDetails = Omit<
	Extract<Awaited<ReturnType<typeof getStoredGuildDetails>>, { icon: string | null }>,
	"guildCommandDeploymentState"
>;
type GuildListItem = Pick<GuildListDetails, "id" | "name" | "isActiveMember"> &
	Partial<Omit<GuildListDetails, "id" | "name" | "isActiveMember">> & {
		guildCommandDeploymentState?: { deployed: number; total: number } | null;
	};

export const guildListKeys = ["id", "name", "icon", "hasRequiredPermissions", "owner"] as const;

export const adminGuildListKeys = [
	...guildListKeys,
	"isActiveMember",
	"memberCount",
	"channelCount",
	"createdAt",
	"description",
	"joinedTimestamp",
	"systemChannel",
	"permissions",
	"guildCommandDeploymentState",
] as const;

export interface GuildUserFilter {
	userId: string;
	/** All listed guild permissions are required; omitted or empty means membership only. */
	permissions?: readonly PermissionResolvable[];
}

export async function listGuilds<K extends keyof GuildListItem>({
	keys,
	userFilter,
}: {
	keys: readonly K[];
	userFilter?: GuildUserFilter | readonly GuildUserFilter[];
}) {
	const selectedKeys: ReadonlySet<keyof GuildListItem> = new Set(keys);
	const userFilters: readonly GuildUserFilter[] =
		userFilter === undefined ? [] : "userId" in userFilter ? [userFilter] : userFilter;
	let guildIds: string[] | undefined;
	if (userFilters.length > 0) {
		guildIds = [];
		for (const guild of getGuilds({ source: "discord" })) {
			if (!guild.available) continue;
			let matches = true;
			for (const { userId, permissions = [] } of userFilters) {
				try {
					const member = await guild.members.fetch(userId);
					if (!permissions.every((permission) => member.permissions.has(permission))) {
						matches = false;
						break;
					}
				} catch (error: unknown) {
					if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
						matches = false;
						break;
					}
					throw error;
				}
			}
			if (matches) {
				guildIds.push(guild.id);
			}
		}
	}
	const requiredPermissions = selectedKeys.has("hasRequiredPermissions")
		? getRequiredGlobalBotPermissions()
		: undefined;
	const storedGuilds = await getGuilds({ source: "database", ...(guildIds ? { guildIds } : {}) });

	const guilds: GuildListItem[] = [];
	for (const { guildId, guildName } of storedGuilds) {
		const details = await getStoredGuildDetails({
			guildId,
			guildName,
			requiredPermissions,
			keys,
		});
		guilds.push(details);
	}
	guilds.sort(
		(first, second) =>
			Number(second.isActiveMember) - Number(first.isActiveMember) || first.name.localeCompare(second.name),
	);
	return guilds.map((guild) =>
		Object.fromEntries(keys.filter((key) => key in guild).map((key) => [key, guild[key]])),
	) as Pick<GuildListItem, K>[];
}
