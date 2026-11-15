import {
	ChannelType,
	DiscordAPIError,
	OverwriteType,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	type Guild,
	type Role,
} from "discord.js";
import type { Response } from "express";
import { z } from "zod";

import { getClient } from "../../../bot.js";
import { logger } from "../../../services/logger.js";
import {
	isBotAdmin,
	isGuildManager,
	isGuildMember,
	getLinkedDiscordAccountId,
	requireAnyAuthorization,
	requireGuildManager,
	requireSession,
	requireValidGuildId,
} from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import {
	filterListByQuery,
	createPaginatedList,
	listQueryParameters,
	listQuerySchema,
	paginateList,
	paginatedListSchema,
	parseListQuery,
	validateListFieldFilters,
} from "../../../helpers/list.js";
import { toApiUser } from "../../../helpers/apiUser.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { getAdminGuildRoleDetails, listAdminGuildChannels, listAdminGuildRoles } from "../../../helpers/adminGuild.js";
import {
	baseGuildKeys,
	getGuildState,
	extendedGuildKeys,
	getAdminGuildForAction,
	getOrCreateGuildData,
	listGuildMembers,
} from "../../../helpers/guild.js";
import { listGuilds } from "../../../services/adminGuild.js";
import type { AuthSession } from "../../../services/auth.js";
import { getGuildMemberState } from "../../../services/guildMemberState.js";
import { getLeaderboard } from "../../../services/leveling.js";
import {
	getWarnedMembers,
	getWarningRecords,
	issueWarningForMember,
	removeWarning,
} from "../../../services/warnings.js";
import {
	addVoiceRegionLock,
	getVoiceRegionIds,
	getVoiceRegionLocks,
	removeVoiceRegionLock,
	VoiceRegionLockValidationError,
} from "../../../services/voiceRegion.js";
import {
	updateAuditLogPreference,
	updateLevelingPreference,
	updateMemberAnnouncementsPreference,
	updateWarningsPreference,
} from "../../../services/servicePreferences.js";
import {
	auditLogPreferenceSchema,
	guildDetailsSchema,
	guildLeaderboardEntrySchema,
	guildLeaderboardSchema,
	guildSchema,
	guildMemberAccessSchema,
	levelingPreferenceSchema,
	memberAnnouncementsPreferenceSchema,
	warnedMemberSchema,
	warningActionResultSchema,
	warningIdSchema,
	warningIssueSchema,
	warningMemberDetailsSchema,
	warningMemberSchema,
	warningsPreferenceSchema,
	voiceRegionLockInputSchema,
	voiceRegionLockSchema,
} from "./schemas.js";

const guildTags = ["Guilds"];
const security = [{ sessionBearer: [] }];
const middleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireValidGuildId,
	requireAnyAuthorization([isGuildManager, isBotAdmin]),
];
const leaderboardMiddleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireValidGuildId,
	requireAnyAuthorization([isGuildMember, isBotAdmin], "Guild membership required"),
];
const guildIdPattern = /^\d{17,20}$/u;
const parameters = [
	{
		name: "guildId",
		in: "path",
		required: true,
		description: "Discord guild ID",
		schema: z.string().regex(guildIdPattern),
	},
] as const;
const accessResponses = {
	400: { description: "Invalid guild ID", schema: errorResponseSchema },
	401: { description: "Authentication required", schema: errorResponseSchema },
	403: { description: "Manage Server access required", schema: errorResponseSchema },
} as const;
const guildChannelSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.number().int(),
	typeName: z.string(),
	createdTimestampMs: z.number().int(),
	parent: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
	position: z.number().int(),
	canSendMessage: z.boolean(),
	canReadMessages: z.boolean(),
	canManageMessages: z.boolean(),
	canManageWebhooks: z.boolean(),
	canManageChannels: z.boolean(),
	canConnect: z.boolean().optional(),
	canSpeak: z.boolean().optional(),
	topic: z.string().nullable().optional(),
	nsfw: z.boolean().optional(),
	rateLimitPerUser: z.number().int().nullable().optional(),
	bitrate: z.number().int().optional(),
	userLimit: z.number().int().optional(),
});
const guildRoleSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string().nullable(),
	position: z.number().int(),
	assignable: z.boolean(),
});
const guildRoleDetailsSchema = guildRoleSchema.extend({
	managed: z.boolean(),
	isBotRole: z.boolean(),
	color: z.string().nullable(),
	iconUrl: z.string().nullable(),
	unicodeEmoji: z.string().nullable(),
	permissions: z.array(z.string()),
	hoisted: z.boolean(),
	mentionable: z.boolean(),
	createdTimestampMs: z.number().int(),
	memberCount: z.number().int(),
});

async function resolveGuild(guildId: unknown, response: Response): Promise<Guild | null> {
	if (typeof guildId !== "string" || !guildIdPattern.test(guildId)) {
		response.status(400).json({ error: "Invalid guild ID" });
		return null;
	}
	const result = await getAdminGuildForAction(guildId);
	switch (result.status) {
		case "not_found":
			response.status(404).json({ error: "Guild not found" });
			return null;
		case "not_member":
			response.status(409).json({ error: "Bot is not a guild member" });
			return null;
		case "unavailable":
			response.status(503).json({ error: "Guild is unavailable" });
			return null;
		default:
			return result.guild;
	}
}

async function resolveGuildMember({ guild, userId, response }: { guild: Guild; userId: unknown; response: Response }) {
	if (typeof userId !== "string" || !/^\d{17,20}$/u.test(userId)) {
		response.status(400).json({ error: "Invalid user ID" });
		return null;
	}
	try {
		return await guild.members.fetch(userId);
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
			response.status(404).json({ error: "Guild member not found" });
			return null;
		}
		throw error;
	}
}

async function fetchWarningUser(guild: Guild, userId: string) {
	return guild.client.users.fetch(userId).catch((error: unknown) => {
		if (
			error instanceof DiscordAPIError &&
			[
				RESTJSONErrorCodes.UnknownUser,
				RESTJSONErrorCodes.MissingAccess,
				RESTJSONErrorCodes.MissingPermissions,
			].includes(Number(error.code))
		) {
			logger.warn("HTTP", "Warning user details are no longer available", { guildId: guild.id, userId, error });
			return null;
		}
		throw error;
	});
}

export default defineRouter("/guilds", [
	{
		method: "get",
		path: "/manager",
		tags: guildTags,
		summary: "List guilds the user can manage",
		errorMessage: "Failed to list guilds",
		security,
		parameters: listQueryParameters(guildSchema),
		responses: {
			200: {
				description: "Registered guilds the user can manage",
				schema: paginatedListSchema(guildSchema),
			},
			400: { description: "Invalid list query", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession],
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const session: AuthSession = response.locals.authSession;
			const discordAccountId = await getLinkedDiscordAccountId(session, response);
			if (!discordAccountId) return;
			const guilds = await listGuilds({
				userFilter: { userId: discordAccountId, permissions: [PermissionFlagsBits.ManageGuild] },
				keys: extendedGuildKeys,
			});
			const filtered = filterListByQuery({
				items: guilds,
				query: query.query,
				fieldFilters: query.fieldFilters,
				itemSchema: guildSchema,
				response,
			});
			if (!filtered) return;
			return response
				.status(200)
				.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
		},
	},
	{
		method: "get",
		path: "/member",
		tags: guildTags,
		summary: "List bot guilds the user is a member of",
		errorMessage: "Failed to list guild memberships",
		security,
		parameters: listQueryParameters(guildSchema),
		responses: {
			200: {
				description: "Bot guilds where the current user is a member",
				schema: paginatedListSchema(guildSchema),
			},
			400: { description: "Invalid list query", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			500: { description: "Failed to list guild memberships", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession],
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const session: AuthSession = response.locals.authSession;
			const discordAccountId = await getLinkedDiscordAccountId(session, response);
			if (!discordAccountId) return;
			const guilds = await listGuilds({
				userFilter: { userId: discordAccountId },
				keys: baseGuildKeys,
			});
			const filtered = filterListByQuery({
				items: guilds,
				query: query.query,
				fieldFilters: query.fieldFilters,
				itemSchema: guildSchema,
				response,
			});
			if (!filtered) return;
			return response
				.status(200)
				.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
		},
	},
	{
		method: "get",
		path: "/:guildId/channels",
		tags: guildTags,
		summary: "List channels in a registered guild",
		errorMessage: "Failed to list guild channels",
		security,
		parameters: [...parameters, ...listQueryParameters(guildChannelSchema)],
		responses: {
			200: {
				description: "Guild channels and categories, excluding threads",
				schema: paginatedListSchema(guildChannelSchema),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild channels", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !guildIdPattern.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const result = await listAdminGuildChannels(guildId);
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok": {
					const filtered = filterListByQuery({
						items: result.channels,
						query: query.query,
						fieldFilters: query.fieldFilters,
						itemSchema: guildChannelSchema,
						response,
					});
					if (!filtered) return;
					return response
						.status(200)
						.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
				}
			}
		},
	},
	{
		method: "get",
		path: "/:guildId/roles/:roleId",
		tags: guildTags,
		summary: "Get details for a role in a registered guild",
		errorMessage: "Failed to get guild role details",
		security,
		parameters: [
			...parameters,
			{
				name: "roleId",
				in: "path",
				required: true,
				description: "Discord role ID",
				schema: z.string().regex(guildIdPattern),
			},
		],
		responses: {
			200: { description: "Guild role details", schema: guildRoleDetailsSchema },
			...accessResponses,
			404: { description: "Guild or role not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get guild role details", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			const roleId = request.params.roleId;
			if (typeof guildId !== "string" || !guildIdPattern.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			if (typeof roleId !== "string" || !guildIdPattern.test(roleId)) {
				return response.status(400).json({ error: "Invalid role ID" });
			}
			const result = await getAdminGuildRoleDetails(guildId, roleId);
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild or role not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok":
					return response.status(200).json(result.role);
			}
		},
	},
	{
		method: "get",
		path: "/:guildId/roles",
		tags: guildTags,
		summary: "List roles in a registered guild",
		errorMessage: "Failed to list guild roles",
		security,
		parameters: [...parameters, ...listQueryParameters(guildRoleSchema)],
		responses: {
			200: {
				description:
					"Guild roles including @everyone, highest position first, with whether the bot can assign each",
				schema: paginatedListSchema(guildRoleSchema),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild roles", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !guildIdPattern.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const result = await listAdminGuildRoles(guildId);
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok": {
					const filtered = filterListByQuery({
						items: result.roles,
						query: query.query,
						fieldFilters: query.fieldFilters,
						itemSchema: guildRoleSchema,
						response,
					});
					if (!filtered) return;
					return response
						.status(200)
						.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
				}
			}
		},
	},
	{
		method: "patch",
		path: "/:guildId/audit-log",
		tags: ["Guild Settings"],
		summary: "Update audit log preferences",
		errorMessage: "Failed to update service preferences",
		security,
		parameters,
		requestBody: {
			required: true,
			content: { "application/json": { schema: auditLogPreferenceSchema } },
		},
		responses: {
			204: { description: "Audit log preferences updated" },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to update service preferences", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = auditLogPreferenceSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const result = await updateAuditLogPreference({ guild, ...body.data });
			if (result.status === "invalid") {
				return response.status(400).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "patch",
		path: "/:guildId/leveling",
		tags: ["Guild Settings"],
		summary: "Update leveling preferences",
		errorMessage: "Failed to update service preferences",
		security,
		parameters,
		requestBody: {
			required: true,
			content: { "application/json": { schema: levelingPreferenceSchema } },
		},
		responses: {
			204: { description: "Leveling preferences updated" },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to update service preferences", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = levelingPreferenceSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const result = await updateLevelingPreference({ guild, ...body.data });
			if (result.status === "invalid") {
				return response.status(400).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "patch",
		path: "/:guildId/member-announcements",
		tags: ["Guild Settings"],
		summary: "Update member announcement preferences",
		errorMessage: "Failed to update service preferences",
		security,
		parameters,
		requestBody: {
			required: true,
			content: { "application/json": { schema: memberAnnouncementsPreferenceSchema } },
		},
		responses: {
			204: { description: "Member announcement preferences updated" },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to update service preferences", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = memberAnnouncementsPreferenceSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const result = await updateMemberAnnouncementsPreference({ guild, ...body.data });
			if (result.status === "invalid") {
				return response.status(400).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "patch",
		path: "/:guildId/warnings",
		tags: ["Guild Settings"],
		summary: "Update warning preferences",
		errorMessage: "Failed to update service preferences",
		security,
		parameters,
		requestBody: {
			required: true,
			content: { "application/json": { schema: warningsPreferenceSchema } },
		},
		responses: {
			204: { description: "Warning preferences updated" },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to update service preferences", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = warningsPreferenceSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const result = await updateWarningsPreference({ guild, ...body.data });
			if (result.status === "invalid") {
				return response.status(400).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "get",
		path: "/:guildId/warnings",
		tags: ["Guild Warnings"],
		summary: "List users with at least one warning in a guild",
		errorMessage: "Failed to list warned users",
		security,
		parameters: [...parameters, ...listQueryParameters(warnedMemberSchema, ["id", "username", "warningCount"])],
		responses: {
			200: {
				description: "Users with positive warning counts, highest count first",
				schema: paginatedListSchema(warnedMemberSchema),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list warned users", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			if (
				!validateListFieldFilters({
					fieldFilters: query.fieldFilters,
					fields: ["id", "username", "warningCount"],
					itemSchema: warnedMemberSchema,
					response,
				})
			) {
				return;
			}
			const { items: members, total } = await getWarnedMembers({
				guildId: guild.id,
				page: query.page,
				perPageLimit: query.perPageLimit,
				fieldFilters: Object.fromEntries(
					Object.entries(query.fieldFilters).map(([field, value]) => [
						field === "id" ? "userId" : field,
						value,
					]),
				),
				...(query.query ? { query: query.query } : {}),
			});
			const enrichedMembers = members.map((member) => {
				const guildMember = guild.members.cache.get(member.userId);
				const user = guildMember?.user ?? guild.client.users.cache.get(member.userId);
				return {
					...toApiUser({
						id: member.userId,
						username: user?.username ?? member.username,
						displayName: guildMember?.displayName ?? user?.globalName,
						avatarUrl:
							guildMember?.displayAvatarURL({ size: 64 }) ?? user?.displayAvatarURL({ size: 64 }) ?? null,
					}),
					warningCount: member.warningCount,
				};
			});
			return response.status(200).json(
				createPaginatedList({
					items: enrichedMembers,
					total,
					page: query.page,
					perPageLimit: query.perPageLimit,
				}),
			);
		},
	},
	{
		method: "get",
		path: "/:guildId/members",
		tags: guildTags,
		summary: "List or search guild members",
		errorMessage: "Failed to list or search guild members",
		security,
		parameters: [...parameters, ...listQueryParameters(warningMemberSchema)],
		responses: {
			200: { description: "Matching guild members", schema: paginatedListSchema(warningMemberSchema) },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list or search guild members", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const members = await listGuildMembers(guild);
			const mappedMembers = members.map((member) =>
				toApiUser({
					id: member.id,
					username: member.user.username,
					displayName: member.displayName,
					avatarUrl: member.displayAvatarURL({ size: 64 }),
				}),
			);
			const filtered = filterListByQuery({
				items: mappedMembers,
				query: query.query,
				fieldFilters: query.fieldFilters,
				itemSchema: warningMemberSchema,
				response,
			});
			if (!filtered) return;
			return response
				.status(200)
				.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
		},
	},
	{
		method: "get",
		path: "/:guildId/users/:userId/access",
		tags: guildTags,
		summary: "Evaluate a guild member's roles, channel access, and permissions",
		errorMessage: "Failed to evaluate guild member access",
		security,
		parameters: [
			...parameters,
			{
				name: "userId",
				in: "path",
				required: true,
				description: "Discord user ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: { description: "Guild member access evaluation", schema: guildMemberAccessSchema },
			...accessResponses,
			404: { description: "Guild or member not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to evaluate guild member access", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const userId = request.params.userId;
			if (typeof userId !== "string" || !guildIdPattern.test(userId)) {
				return response.status(400).json({ error: "Invalid user ID" });
			}
			const member = await guild.members.fetch(userId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
					return null;
				}
				throw error;
			});
			if (!member) {
				return response.status(404).json({ error: "Guild member not found" });
			}

			const [guildRoles, fetchedChannels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
			const roleAccess = (role: Role) => ({
				id: role.id,
				name: role.name,
				position: role.position,
				color: role.color === 0 ? null : role.hexColor,
				managed: role.managed,
				permissions: role.permissions.toArray(),
			});
			const roles = [...guildRoles.values()]
				.filter((role) => role.id !== guild.id)
				.sort((first, second) => second.position - first.position || first.id.localeCompare(second.id));
			const hasManageRoles = member.permissions.has(PermissionFlagsBits.ManageRoles);
			const canManageOrAssignRole = (role: Role) =>
				!role.managed &&
				(member.id === guild.ownerId || (hasManageRoles && member.roles.highest.comparePositionTo(role) > 0));
			const assignedRoles = [...member.roles.cache.values()]
				.filter((role) => role.id !== guild.id)
				.sort((first, second) => second.position - first.position || first.id.localeCompare(second.id));
			const everyoneRole = guildRoles.get(guild.id);
			const permissionRoles = [...(everyoneRole ? [everyoneRole] : []), ...assignedRoles];
			const permissionSources = member.permissions.toArray().map((permission) => ({
				permission,
				roles:
					member.id === guild.ownerId
						? []
						: permissionRoles
								.filter(
									(role) =>
										role.permissions.has(permission) ||
										role.permissions.has(PermissionFlagsBits.Administrator),
								)
								.map((role) => ({
									id: role.id,
									name: role.name,
									color: role.color === 0 ? null : role.hexColor,
								})),
			}));
			const channels = [...fetchedChannels.values()]
				.filter(
					(channel): channel is NonNullable<typeof channel> =>
						channel !== null && channel.type !== ChannelType.GuildCategory && !channel.isThread(),
				)
				.sort((first, second) => first.rawPosition - second.rawPosition || first.id.localeCompare(second.id))
				.map((channel) => {
					const permissions = channel.permissionsFor(member);
					const overrides = [...channel.permissionOverwrites.cache.values()]
						.filter(
							(overwrite) =>
								(overwrite.type === OverwriteType.Member && overwrite.id === member.id) ||
								(overwrite.type === OverwriteType.Role &&
									(overwrite.id === guild.id || member.roles.cache.has(overwrite.id))),
						)
						.map((overwrite) => ({
							targetType:
								overwrite.type === OverwriteType.Member ? ("member" as const) : ("role" as const),
							targetName:
								overwrite.type === OverwriteType.Member
									? member.displayName
									: (guild.roles.cache.get(overwrite.id)?.name ?? "Unknown role"),
							allow: overwrite.allow.toArray(),
							deny: overwrite.deny.toArray(),
						}));
					return {
						id: channel.id,
						name: channel.name,
						typeName: ChannelType[channel.type] ?? `Unknown (${channel.type})`,
						parentName: channel.parent?.name ?? null,
						canAccess: permissions?.has(PermissionFlagsBits.ViewChannel) ?? null,
						permissions: permissions?.toArray() ?? null,
						overrides,
					};
				});

			return response.status(200).json({
				member: {
					...toApiUser({
						id: member.id,
						username: member.user.username,
						displayName: member.displayName,
						avatarUrl: member.displayAvatarURL({ size: 64 }),
					}),
					bot: member.user.bot,
					joinedTimestampMs: member.joinedTimestamp,
					isOwner: member.id === guild.ownerId,
					permissions: member.permissions.toArray(),
				},
				roles: {
					assigned: assignedRoles.map(roleAccess),
					manageable: roles.filter(canManageOrAssignRole).map(roleAccess),
					assignable: roles.filter(canManageOrAssignRole).map(roleAccess),
				},
				permissionSources,
				channels,
			});
		},
	},
	{
		method: "get",
		path: "/:guildId/users/:userId/warn",
		tags: ["Guild Warnings"],
		summary: "Get a guild member's warning count and history",
		errorMessage: "Failed to get member warning count",
		security,
		parameters: [
			...parameters,
			{
				name: "userId",
				in: "path",
				required: true,
				description: "Discord user ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: {
				description: "Guild member, warning count, and history with issuer details",
				schema: warningMemberDetailsSchema,
			},
			...accessResponses,
			404: { description: "Guild or member not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get member warning count", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const userId = request.params.userId;
			if (typeof userId !== "string" || !/^\d{17,20}$/u.test(userId)) {
				return response.status(400).json({ error: "Invalid user ID" });
			}
			const member = await guild.members.fetch(userId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
					return null;
				}
				throw error;
			});
			const storedMember = !member ? await getGuildMemberState(guild.id, userId) : null;
			if (!member && !storedMember) {
				return response.status(404).json({ error: "User has no stored guild warning history" });
			}
			const user = member?.user ?? (await fetchWarningUser(guild, userId));
			const username = user?.username ?? storedMember?.username ?? userId;
			const warnings = await getWarningRecords(guild.id, userId);
			const issuers = new Map<string, ReturnType<typeof toApiUser>>();
			await Promise.all(
				[...new Set(warnings.map((warning) => warning.issuerId).filter((id): id is string => id !== null))].map(
					async (issuerId) => {
						const issuer = await fetchWarningUser(guild, issuerId);
						issuers.set(
							issuerId,
							issuer
								? toApiUser({
										id: issuer.id,
										username: issuer.username,
										displayName: issuer.globalName,
										avatarUrl: issuer.displayAvatarURL({ size: 64 }),
									})
								: toApiUser({ id: issuerId, username: issuerId }),
						);
					},
				),
			);
			return response.status(200).json({
				...toApiUser({
					id: userId,
					username,
					displayName: member?.displayName ?? user?.globalName,
					avatarUrl: member?.displayAvatarURL({ size: 64 }) ?? user?.displayAvatarURL({ size: 64 }) ?? null,
				}),
				isGuildMember: member !== null,
				warningCount: warnings.length,
				warnings: warnings.map((warning) => ({
					...warning,
					issuer: warning.issuerId ? issuers.get(warning.issuerId) : null,
				})),
			});
		},
	},
	{
		method: "get",
		path: "/:guildId/voice-region-locks",
		tags: ["Guild Voice Region Locks"],
		summary: "List voice region locks and available regions",
		errorMessage: "Failed to list voice region locks",
		security,
		parameters: [...parameters, ...listQueryParameters(voiceRegionLockSchema)],
		responses: {
			200: {
				description: "Voice region locks and available Discord voice regions",
				schema: paginatedListSchema(voiceRegionLockSchema).extend({ regions: z.array(z.string()) }),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list voice region locks", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const [locks, regions] = await Promise.all([getVoiceRegionLocks(guild), getVoiceRegionIds(guild)]);
			const displayLocks = await Promise.all(
				locks.map(async (lock) => {
					const member = guild.members.cache.get(lock.userId);
					const user =
						member?.user ??
						(await guild.client.users.fetch(lock.userId).catch((error: unknown) => {
							if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownUser) {
								logger.warn("HTTP", "Voice region lock user is no longer available", {
									guildId: guild.id,
									userId: lock.userId,
								});
								return null;
							}
							throw error;
						}));
					return {
						...toApiUser({
							id: lock.userId,
							username: user?.username ?? lock.userName,
							displayName: member?.displayName ?? user?.globalName,
							avatarUrl:
								member?.displayAvatarURL({ size: 64 }) ?? user?.displayAvatarURL({ size: 64 }) ?? null,
						}),
						channelId: lock.channelId,
						channelName: guild.channels.cache.get(lock.channelId)?.name ?? lock.channelName,
						region: lock.region,
						fallbackRegion: lock.fallbackRegion,
					};
				}),
			);
			const filtered = filterListByQuery({
				items: displayLocks,
				query: query.query,
				fieldFilters: query.fieldFilters,
				itemSchema: voiceRegionLockSchema,
				response,
			});
			if (!filtered) return;
			return response.status(200).json({
				...paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }),
				regions,
			});
		},
	},
	{
		method: "post",
		path: "/:guildId/voice-region-locks",
		tags: ["Guild Voice Region Locks"],
		summary: "Create a voice region lock",
		errorMessage: "Failed to create voice region lock",
		security,
		parameters,
		requestBody: {
			required: true,
			content: { "application/json": { schema: voiceRegionLockInputSchema } },
		},
		responses: {
			201: { description: "Voice region lock created", schema: voiceRegionLockSchema },
			...accessResponses,
			400: { description: "Invalid guild ID or voice region lock body", schema: errorResponseSchema },
			404: { description: "Guild or member not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to create voice region lock", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = voiceRegionLockInputSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const member = await resolveGuildMember({ guild, userId: body.data.userId, response });
			if (!member) return;
			try {
				const lock = await addVoiceRegionLock({
					guild,
					userId: member.id,
					userName: member.user.username,
					channelId: body.data.channelId,
					region: body.data.region,
				});
				return response.status(201).json({
					...toApiUser({
						id: member.id,
						username: member.user.username,
						displayName: member.displayName,
						avatarUrl: member.displayAvatarURL({ size: 64 }),
					}),
					channelId: lock.channelId,
					channelName: lock.channelName,
					region: lock.region,
					fallbackRegion: lock.fallbackRegion,
				});
			} catch (error: unknown) {
				if (error instanceof VoiceRegionLockValidationError) {
					return response.status(400).json({ error: error.message });
				}
				throw error;
			}
		},
	},
	{
		method: "delete",
		path: "/:guildId/voice-region-locks/:userId",
		tags: ["Guild Voice Region Locks"],
		summary: "Delete a user's voice region lock",
		errorMessage: "Failed to delete voice region lock",
		security,
		parameters: [
			...parameters,
			{
				name: "userId",
				in: "path",
				required: true,
				description: "Discord user ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			204: { description: "Voice region lock removed" },
			...accessResponses,
			400: { description: "Invalid guild or user ID", schema: errorResponseSchema },
			404: { description: "Guild or voice region lock not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to delete voice region lock", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const userId = request.params.userId;
			if (typeof userId !== "string" || !/^\d{17,20}$/u.test(userId)) {
				return response.status(400).json({ error: "Invalid user ID" });
			}
			if (!(await removeVoiceRegionLock(guild, userId))) {
				return response.status(404).json({ error: "Voice region lock not found" });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:guildId/users/:userId/warn",
		tags: ["Guild Warnings"],
		summary: "Issue a warning to a guild member",
		errorMessage: "Failed to issue warning",
		security,
		parameters: [
			...parameters,
			{
				name: "userId",
				in: "path",
				required: true,
				description: "Discord user ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		requestBody: {
			required: true,
			content: { "application/json": { schema: warningIssueSchema } },
		},
		responses: {
			200: {
				description: "Warning issued and configured threshold action applied",
				schema: warningActionResultSchema,
			},
			...accessResponses,
			404: { description: "Guild or member not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to issue warning", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const body = warningIssueSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request body" });
			}
			const member = await resolveGuildMember({ guild, userId: request.params.userId, response });
			if (!member) return;
			const session: AuthSession = response.locals.authSession;
			const issuerId = await getLinkedDiscordAccountId(session, response);
			if (!issuerId) return;
			const result = await issueWarningForMember({
				guild,
				member,
				issuerId,
				reason: body.data.reason || "No reason provided",
			});
			return response.status(200).json(result);
		},
	},
	{
		method: "delete",
		path: "/:guildId/users/:userId/warn/:warningId",
		tags: ["Guild Warnings"],
		summary: "Delete a warning from a guild member's history",
		errorMessage: "Failed to delete member warning",
		security,
		parameters: [
			...parameters,
			{
				name: "userId",
				in: "path",
				required: true,
				description: "Discord user ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
			{
				name: "warningId",
				in: "path",
				required: true,
				description: "Warning record ID",
				schema: warningIdSchema,
			},
		],
		responses: {
			204: { description: "Warning deleted" },
			...accessResponses,
			400: { description: "Invalid warning ID", schema: errorResponseSchema },
			404: { description: "Guild, member, or warning not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to delete member warning", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const warningId = warningIdSchema.safeParse(request.params.warningId);
			if (!warningId.success) {
				return response.status(400).json({ error: warningId.error.issues[0]?.message ?? "Invalid warning ID" });
			}
			const userId = request.params.userId;
			if (typeof userId !== "string" || !/^\d{17,20}$/u.test(userId)) {
				return response.status(400).json({ error: "Invalid user ID" });
			}
			const removed = await removeWarning({
				guildId: guild.id,
				userId,
				warningId: warningId.data,
			});
			if (!removed) {
				return response.status(404).json({ error: "Warning not found" });
			}
			return response.status(204).end();
		},
	},
	{
		method: "get",
		path: "/:guildId/leaderboard",
		tags: guildTags,
		summary: "Get a guild's leveling leaderboard",
		errorMessage: "Failed to get guild leaderboard",
		security,
		parameters: [...parameters, ...listQueryParameters(guildLeaderboardEntrySchema, ["id", "username", "points"])],
		responses: {
			200: { description: "Guild leaderboard and leveling reward", schema: guildLeaderboardSchema },
			...accessResponses,
			403: { description: "Guild membership required", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get guild leaderboard", schema: errorResponseSchema },
		},
		middleware: leaderboardMiddleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;

			const guildData = await getOrCreateGuildData({ guild });
			const guildState = await getGuildState({ guildData, keys: ["servicePreferences"] });
			if (!guildState.servicePreferences) {
				throw new Error(`Service preferences are unavailable for guild ${guild.id}`);
			}
			if (
				!validateListFieldFilters({
					fieldFilters: query.fieldFilters,
					fields: ["id", "username", "points"],
					itemSchema: guildLeaderboardEntrySchema,
					response,
				})
			) {
				return;
			}
			const { leveling } = guildState.servicePreferences;
			const leaderboard = leveling.enabled
				? await getLeaderboard({
						guildId: guild.id,
						page: query.page,
						pageSize: query.perPageLimit,
						clampPage: false,
						fieldFilters: Object.fromEntries(
							Object.entries(query.fieldFilters).map(([field, value]) => [
								field === "id" ? "userId" : field,
								value,
							]),
						),
						...(query.query ? { query: query.query } : {}),
					})
				: { entries: [], page: query.page, pageCount: 0, total: 0 };
			const uncachedMemberIds = leaderboard.entries
				.filter((entry) => !guild.members.cache.has(entry.userId))
				.map((entry) => entry.userId);
			if (uncachedMemberIds.length > 0) {
				await guild.members.fetch({ user: uncachedMemberIds });
			}

			return response.status(200).json({
				guildName: guild.name,
				guildIcon: guild.iconURL(),
				enabled: leveling.enabled,
				reward:
					leveling.threshold !== null && leveling.role
						? { threshold: leveling.threshold, role: leveling.role }
						: null,
				items: leaderboard.entries.map((entry, index) => {
					const member = guild.members.cache.get(entry.userId);
					const user = member?.user ?? guild.client.users.cache.get(entry.userId);
					return {
						...toApiUser({
							id: entry.userId,
							username: user?.username ?? entry.username,
							displayName: member?.displayName ?? user?.globalName,
							avatarUrl:
								member?.displayAvatarURL({ size: 64 }) ?? user?.displayAvatarURL({ size: 64 }) ?? null,
						}),
						rank: (leaderboard.page - 1) * query.perPageLimit + index + 1,
						points: entry.leveling.points,
					};
				}),
				pagination: {
					page: leaderboard.page,
					perPageLimit: query.perPageLimit,
					total: leaderboard.total,
					totalPages:
						query.perPageLimit === 0
							? Number(leaderboard.total > 0)
							: Math.ceil(leaderboard.total / query.perPageLimit),
				},
			});
		},
	},
	{
		method: "get",
		path: "/:guildId",
		tags: guildTags,
		summary: "Get a registered guild",
		errorMessage: "Failed to get guild",
		security,
		parameters,
		responses: {
			200: {
				description: "Registered guild details",
				schema: guildDetailsSchema,
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			500: { description: "Failed to get guild", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireValidGuildId, requireGuildManager],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !guildIdPattern.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const guild = await getGuildState({
				guildId,
				keys: [
					...extendedGuildKeys,
					"isActiveMember",
					"joinedTimestampMs",
					"createdTimestampMs",
					"servicePreferences",
					"permissions",
				],
			});
			if (!guild) {
				return response.status(404).json({ error: "Guild not found" });
			}
			return response.status(200).json(guild);
		},
	},
]);
