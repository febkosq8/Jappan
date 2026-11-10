import { PermissionFlagsBits, type Guild } from "discord.js";
import type { Response } from "express";
import { z } from "zod";

import { getClient } from "../../../bot.js";
import {
	isBotAdmin,
	isGuildManager,
	requireAnyAuthorization,
	requireGuildManager,
	requireSession,
	requireValidGuildId,
} from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { listAdminGuildChannels, listAdminGuildRoles } from "../../../helpers/adminGuild.js";
import {
	baseGuildKeys,
	getGuildState,
	extendedGuildKeys,
	getAdminGuildForAction,
	getOrCreateGuildData,
} from "../../../helpers/guild.js";
import { listGuilds } from "../../../services/adminGuild.js";
import type { AuthSession } from "../../../services/auth.js";
import AuthUserModel from "../../../models/authUser.js";
import { getLeaderboard, LEADERBOARD_PAGE_SIZE } from "../../../services/leveling.js";
import {
	updateAuditLogPreference,
	updateLevelingPreference,
	updateMemberAnnouncementsPreference,
	updateWarningsPreference,
} from "../../../services/servicePreferences.js";
import {
	auditLogPreferenceSchema,
	guildDetailsSchema,
	guildLeaderboardSchema,
	guildSchema,
	levelingPreferenceSchema,
	memberAnnouncementsPreferenceSchema,
	warningsPreferenceSchema,
} from "./schemas.js";

const tags = ["Guild"];
const security = [{ sessionCookie: [] }];
const middleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireValidGuildId,
	requireAnyAuthorization([isGuildManager, isBotAdmin]),
];
const guildIdPattern = /^\d{17,20}$/u;
const leaderboardPageSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
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

export default defineRouter("/guilds", [
	{
		method: "get",
		path: "/",
		tags,
		summary: "List guilds the user can manage",
		errorMessage: "Failed to list guilds",
		security,
		responses: {
			200: {
				description: "Registered guilds the user can manage",
				schema: z.array(guildSchema),
			},
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession],
		handler: async (_request, response) => {
			const session: AuthSession = response.locals.authSession;
			if (session.user.status !== "active" && session.user.status !== undefined) {
				return response.status(403).json({ error: "Active account required" });
			}
			const user = await AuthUserModel.findById(session.user.id).select({ discordAccountId: 1 }).exec();
			if (!user?.discordAccountId) {
				return response.status(403).json({ error: "Linked Discord account required" });
			}
			return response.status(200).json(
				await listGuilds({
					userFilter: { userId: user.discordAccountId, permissions: [PermissionFlagsBits.ManageGuild] },
					keys: extendedGuildKeys,
				}),
			);
		},
	},
	{
		method: "get",
		path: "/:guildId/channels",
		tags,
		summary: "List channels in a registered guild",
		errorMessage: "Failed to list guild channels",
		security,
		parameters,
		responses: {
			200: {
				description: "Guild channels and categories, excluding threads",
				schema: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						type: z.number().int(),
						typeName: z.string(),
						createdTimestampMs: z.number().int(),
						parent: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
						position: z.number().int(),
						canSendMessage: z.boolean(),
						topic: z.string().nullable().optional(),
						nsfw: z.boolean().optional(),
						rateLimitPerUser: z.number().int().nullable().optional(),
						bitrate: z.number().int().optional(),
						userLimit: z.number().int().optional(),
					}),
				),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild channels", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
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
				case "ok":
					return response.status(200).json(result.channels);
			}
		},
	},
	{
		method: "get",
		path: "/:guildId/roles",
		tags,
		summary: "List roles in a registered guild",
		errorMessage: "Failed to list guild roles",
		security,
		parameters,
		responses: {
			200: {
				description: "Guild roles, highest first, with whether the bot can assign each",
				schema: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						position: z.number().int(),
						managed: z.boolean(),
						assignable: z.boolean(),
					}),
				),
			},
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild roles", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
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
				case "ok":
					return response.status(200).json(result.roles);
			}
		},
	},
	{
		method: "patch",
		path: "/:guildId/audit-log",
		tags,
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
		tags,
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
		tags,
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
		tags,
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
		path: "/:guildId/leaderboard",
		tags,
		summary: "Get a guild's leveling leaderboard",
		errorMessage: "Failed to get guild leaderboard",
		security,
		parameters: [
			...parameters,
			{
				name: "page",
				in: "query",
				required: false,
				description: "Leaderboard page number (20 entries per page)",
				schema: z.number().int().min(1),
			},
		],
		responses: {
			200: { description: "Guild leaderboard and leveling reward", schema: guildLeaderboardSchema },
			...accessResponses,
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get guild leaderboard", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const guild = await resolveGuild(request.params.guildId, response);
			if (!guild) return;
			const pageResult = leaderboardPageSchema.safeParse(request.query.page ?? 1);
			if (!pageResult.success) {
				return response.status(400).json({ error: "Invalid leaderboard page" });
			}

			const guildData = await getOrCreateGuildData({ guild });
			const guildState = await getGuildState({ guildData, keys: ["servicePreferences"] });
			if (!guildState.servicePreferences) {
				throw new Error(`Service preferences are unavailable for guild ${guild.id}`);
			}
			const { leveling } = guildState.servicePreferences;
			const leaderboard = leveling.enabled
				? await getLeaderboard({ guildId: guild.id, page: pageResult.data, pageSize: LEADERBOARD_PAGE_SIZE })
				: { entries: [], page: 1, pageCount: 1 };
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
				entries: leaderboard.entries.map((entry, index) => ({
					rank: (leaderboard.page - 1) * LEADERBOARD_PAGE_SIZE + index + 1,
					userId: entry.userId,
					username: entry.username,
					avatarUrl:
						guild.members.cache.get(entry.userId)?.displayAvatarURL({ size: 64 }) ??
						guild.client.users.cache.get(entry.userId)?.displayAvatarURL({ size: 64 }) ??
						null,
					points: entry.leveling.points,
				})),
				page: leaderboard.page,
				pageCount: leaderboard.pageCount,
			});
		},
	},
	{
		method: "get",
		path: "/:guildId",
		tags,
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
