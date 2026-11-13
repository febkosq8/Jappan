import { z } from "zod";
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";
import type { GuildBasedChannel } from "discord.js";
import type { Response } from "express";

import {
	getLinkedDiscordAccountId,
	isBotAdmin,
	isGuildManager,
	requireAnyAuthorization,
	requireSession,
	requireValidGuildId,
} from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { getAdminGuildForAction } from "../../../helpers/guild.js";
import {
	createPurgeMessageJob,
	PurgeMessageJobActionError,
	type PurgeableGuildChannel,
} from "../../../services/purgeMessageJobs.js";
import {
	PurgeMessageTextFilterError,
	purgeMessageTextFilterMaxLength,
} from "../../../services/purgeMessageTextFilter.js";
import { getPurgeChannelPermissionError, isPurgeableGuildChannel } from "../../../services/purgeMessagePreviews.js";
import type { AuthSession } from "../../../services/auth.js";

const guildPurgeRequestSchema = z.strictObject({
	channelId: z
		.string()
		.regex(/^\d{17,20}$/u, "Invalid channel ID")
		.optional()
		.describe("Omit to scan all supported guild channels with the required permissions"),
	count: z.number().int().min(1).max(200).default(100),
	userId: z
		.string()
		.regex(/^\d{17,20}$/u, "Invalid user ID")
		.optional(),
	text: z
		.string()
		.max(purgeMessageTextFilterMaxLength, "Text filter must be 2000 characters or fewer")
		.optional()
		.describe("Literal text by default; with regex enabled, supply an RE2 pattern without slash delimiters"),
	regex: z
		.boolean()
		.default(false)
		.describe("Use linear-time RE2 matching; invalid, overly complex, and unsupported patterns are rejected"),
	ignoreCase: z.boolean().default(false).describe("Ignore case for either literal text or regex matching"),
});

const purgeMessageMiddleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireValidGuildId,
	requireAnyAuthorization([isGuildManager, isBotAdmin], "Manage Server or bot admin access required"),
];
async function getPurgeMessageAccess({
	guildId,
	channelId,
	response,
	session,
}: {
	guildId: string;
	channelId: string | null;
	response: Response;
	session: AuthSession;
}) {
	const adminGuild = await getAdminGuildForAction(guildId);
	switch (adminGuild.status) {
		case "not_found":
			response.status(404).json({ error: "Guild not found" });
			return null;
		case "not_member":
			response.status(409).json({ error: "Bot is not a guild member" });
			return null;
		case "unavailable":
			response.status(503).json({ error: "Guild is unavailable" });
			return null;
	}

	const userId = await getLinkedDiscordAccountId(session, response);
	if (!userId) return null;
	const isBotAdministrator = session.user.role === "admin";
	const member = await adminGuild.guild.members.fetch(userId).catch((error: unknown) => {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null;
		throw error;
	});
	if (!isBotAdministrator && !member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
		response.status(403).json({ error: "Manage Server access to this guild is required" });
		return null;
	}

	const selectedChannel = channelId
		? await adminGuild.guild.channels.fetch(channelId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) return null;
				throw error;
			})
		: null;
	if (channelId && (!selectedChannel || selectedChannel.guildId !== guildId)) {
		response.status(404).json({ error: "Channel not found" });
		return null;
	}
	if (selectedChannel && !isPurgeableGuildChannel(selectedChannel)) {
		response.status(400).json({ error: "Choose a text, announcement, or voice channel that supports messages" });
		return null;
	}

	const botMember = adminGuild.guild.members.me ?? (await adminGuild.guild.members.fetchMe());
	const candidates: GuildBasedChannel[] = selectedChannel
		? [selectedChannel]
		: [...(await adminGuild.guild.channels.fetch()).values()].filter((channel) => channel !== null);
	const channels: PurgeableGuildChannel[] = [];
	let skippedChannelCount = 0;
	for (const channel of candidates) {
		if (!isPurgeableGuildChannel(channel)) continue;
		const error = getPurgeChannelPermissionError({ channel, member, botMember, isBotAdministrator });
		if (error) {
			if (channelId) {
				response.status(403).json({ error });
				return null;
			}
			skippedChannelCount += 1;
			continue;
		}
		channels.push(channel);
	}
	const channel = channels[0];
	if (!channel) {
		response.status(403).json({ error: "No message channels are available with the required permissions" });
		return null;
	}

	return {
		guild: adminGuild.guild,
		channel,
		channels,
		skippedChannelCount,
		userId,
		member,
		botMember,
		isBotAdministrator,
	};
}

export default defineRouter("/guilds", [
	{
		method: "post",
		path: "/:guildId/messages/purge",
		tags: ["Guild"],
		summary: "Create a purge request without scanning or deleting messages",
		errorMessage: "Failed to create message purge job",
		security: [{ sessionCookie: [] }],
		parameters: [{ name: "guildId", in: "path", required: true, schema: z.string().regex(/^\d{17,20}$/u) }],
		requestBody: { required: true, content: { "application/json": { schema: guildPurgeRequestSchema } } },
		responses: {
			202: {
				description: "Job created; preview and confirmation happen on the job page",
				schema: z.object({ jobId: z.string().uuid() }),
			},
			400: { description: "Invalid guild, channel, or filters", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: {
				description: "Manage Server or bot admin access and channel permissions required",
				schema: errorResponseSchema,
			},
			404: { description: "Guild or channel not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to create message purge job", schema: errorResponseSchema },
		},
		middleware: purgeMessageMiddleware,
		errorHandler: (error, _request, response) => {
			const status =
				error instanceof PurgeMessageTextFilterError
					? 400
					: error instanceof PurgeMessageJobActionError
						? error.status
						: 500;
			response.status(status).json({
				error:
					error instanceof PurgeMessageTextFilterError || error instanceof PurgeMessageJobActionError
						? error.message
						: "Failed to create message purge job",
			});
		},
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const body = guildPurgeRequestSchema.safeParse(request.body);
			if (!body.success)
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid purge request" });
			const session: AuthSession | undefined = response.locals.authSession;
			if (!session) return response.status(401).json({ error: "Authentication required" });
			const access = await getPurgeMessageAccess({
				guildId,
				channelId: body.data.channelId ?? null,
				response,
				session,
			});
			if (!access) return;
			const job = createPurgeMessageJob({
				guild: access.guild,
				channels: access.channels,
				creatorDiscordId: access.userId,
				count: body.data.count,
				...(body.data.channelId ? { selectedChannelId: body.data.channelId } : {}),
				...(body.data.userId ? { targetUserId: body.data.userId } : {}),
				...(body.data.text !== undefined ? { text: body.data.text } : {}),
				regex: body.data.regex,
				ignoreCase: body.data.ignoreCase,
			});
			return response.status(202).json({ jobId: job.jobId });
		},
	},
]);
