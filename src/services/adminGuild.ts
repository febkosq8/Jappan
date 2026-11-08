import type { Client, PermissionResolvable } from "discord.js";
import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

import { formatUser } from "../helpers/discord.js";
import { getGuildState, getClientGuilds, getGuildDataList } from "../helpers/guild.js";
import { getRequiredGlobalBotPermissions } from "./commandLoader.js";
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

type GuildListDetails = Awaited<ReturnType<typeof getGuildState>>;
type GuildListItem = Required<Pick<GuildListDetails, "id" | "name" | "isActiveMember">> &
	Omit<GuildListDetails, "id" | "name" | "isActiveMember">;

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
		for (const guild of getClientGuilds()) {
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
	const storedGuilds = await getGuildDataList(guildIds);

	const guilds: GuildListItem[] = [];
	for (const guildData of storedGuilds) {
		const details = await getGuildState({
			guildData,
			requiredPermissions,
			keys: [...keys, "isActiveMember"],
		});
		if (details.isActiveMember === undefined) {
			throw new Error(`Failed to compute sorting state for guild ${guildData.guildId}`);
		}
		guilds.push({ ...details, isActiveMember: details.isActiveMember });
	}
	guilds.sort(
		(first, second) =>
			Number(second.isActiveMember) - Number(first.isActiveMember) || first.name.localeCompare(second.name),
	);
	return guilds.map((guild) => ({
		id: guild.id,
		name: guild.name,
		...Object.fromEntries(keys.filter((key) => key in guild).map((key) => [key, guild[key]])),
	})) as Pick<GuildListItem, K | "id" | "name">[];
}
