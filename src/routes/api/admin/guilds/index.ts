import { z } from "zod";
import { ChannelType, DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";
import type { GuildBasedChannel, Message } from "discord.js";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

import {
	getLinkedDiscordAccountId,
	isBotAdmin,
	isGuildManager,
	requireAnyAuthorization,
	requireAdmin,
	requireSession,
	requireValidGuildId,
} from "../../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import { getGuildInvite, kickGuild, sendGuildAdminMessage } from "../../../../helpers/adminGuild.js";
import {
	allGuildKeys,
	canSendMessage,
	getGuildState,
	extendedGuildKeys,
	getAdminGuildForAction,
} from "../../../../helpers/guild.js";
import { listGuilds } from "../../../../services/adminGuild.js";
import { setGuildCommands } from "../../../../services/adminDeployment.js";
import { startClearMessageJob, type ClearableGuildChannel } from "../../../../services/clearMessageJobs.js";
import type { AuthSession } from "../../../../services/auth.js";
import { getConfig } from "../../../../services/config.js";
import { adminGuildDetailsSchema, adminGuildSchema } from "../../guilds/schemas.js";

const adminGuildCommandsResultSchema = z.object({
	action: z.enum(["deploy", "undeploy"]),
	commandCount: z.number().int().nonnegative(),
});

async function updateGuildCommands(request: Request, response: Response, action: "deploy" | "undeploy") {
	const guildId = request.params.guildId;
	if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
		return response.status(400).json({ error: "Invalid guild ID" });
	}

	const adminGuild = await getAdminGuildForAction(guildId);
	switch (adminGuild.status) {
		case "not_found":
			return response.status(404).json({ error: "Guild not found" });
		case "not_member":
			return response.status(409).json({ error: "Bot is not a guild member" });
		case "unavailable":
			return response.status(503).json({ error: "Guild is unavailable" });
	}

	const commandCount = await setGuildCommands(adminGuild.guild, action === "deploy");
	return response.status(200).json({ action, commandCount });
}

const adminGuildMessageSchema = z.object({
	channelId: z.string().regex(/^\d{17,20}$/u, "Invalid channel ID"),
	message: z
		.string()
		.min(1, "Message cannot be empty")
		.max(4096, "Message must be 4096 characters or fewer")
		.refine((message) => message.trim().length > 0, "Message cannot be empty"),
});

const adminGuildKickSchema = z.object({
	confirm: z.literal(true),
	message: z.string().max(1000, "Message must be 1000 characters or fewer").optional(),
	channelId: z
		.string()
		.regex(/^\d{17,20}$/u, "Invalid channel ID")
		.nullable()
		.optional(),
});

const activeGuildKicks = new Set<string>();

const adminGuildInviteSchema = z.object({
	url: z.string().url(),
	channel: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
	maxAge: z.number().int().nullable(),
	createdTimestampMs: z.number().int().nullable(),
	expiresTimestampMs: z.number().int().nullable(),
	uses: z.number().int().nullable(),
	maxUses: z.number().int().nullable(),
	temporary: z.boolean(),
	inviter: z.object({ id: z.string(), username: z.string() }).nullable(),
});

const adminGuildClearRequestSchema = z.object({
	channelId: z.string().regex(/^\d{17,20}$/u, "Invalid channel ID"),
	count: z.number().int().min(1).max(100).default(100),
	userId: z
		.string()
		.regex(/^\d{17,20}$/u, "Invalid user ID")
		.optional(),
	text: z.string().max(2000, "Text filter must be 2000 characters or fewer").optional(),
});

const adminGuildClearPreviewSchema = z.object({
	previewId: z.string().uuid(),
	guild: z.object({ id: z.string(), name: z.string() }),
	channel: z.object({ id: z.string(), name: z.string() }),
	scannedCount: z.number().int().nonnegative(),
	matchedCount: z.number().int().nonnegative(),
	deleteCount: z.number().int().nonnegative(),
	bulkDeleteCount: z.number().int().nonnegative(),
	individualDeleteCount: z.number().int().nonnegative(),
	olderThanBulkDeleteLimit: z.number().int().nonnegative(),
	scanLimitReached: z.boolean(),
	expiresAt: z.number().int(),
	messages: z.array(
		z.object({
			id: z.string(),
			author: z.object({ id: z.string(), username: z.string(), displayName: z.string() }),
			content: z.string(),
			createdTimestampMs: z.number().int(),
			jumpUrl: z.string().url(),
		}),
	),
});

type ClearPreview = {
	id: string;
	guildId: string;
	userId: string;
	channelId: string;
	count: number;
	targetUserId: string | null;
	textFilter: string | null;
	scannedCount: number;
	matchedCount: number;
	messages: Message[];
	expiresAt: number;
};

const clearPreviews = new Map<string, ClearPreview>();
const clearPreviewLifetimeMs = 10 * 60 * 1000;
const clearScanLimit = 100;
const bulkDeleteAgeMs = 14 * 24 * 60 * 60 * 1000;
const clearMessageMiddleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireValidGuildId,
	requireAnyAuthorization([isGuildManager, isBotAdmin], "Manage Server or bot admin access required"),
];
const clearableChannelTypes = new Set<number>([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildVoice,
]);

function pruneClearState() {
	const now = Date.now();
	for (const [id, preview] of clearPreviews) {
		if (preview.expiresAt <= now) clearPreviews.delete(id);
	}
}

function isClearableGuildChannel(channel: GuildBasedChannel | null): channel is ClearableGuildChannel {
	return (
		channel !== null &&
		channel.isTextBased() &&
		"messages" in channel &&
		typeof channel.messages.fetch === "function" &&
		"permissionsFor" in channel
	);
}

async function getClearMessageAccess({
	guildId,
	channelId,
	response,
	session,
}: {
	guildId: string;
	channelId: string;
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

	const channel = await adminGuild.guild.channels.fetch(channelId).catch((error: unknown) => {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) return null;
		throw error;
	});
	if (!channel || channel.guildId !== guildId) {
		response.status(404).json({ error: "Channel not found" });
		return null;
	}
	if (!clearableChannelTypes.has(channel.type) || !isClearableGuildChannel(channel)) {
		response.status(400).json({ error: "Choose a text, announcement, or voice channel that supports messages" });
		return null;
	}

	if (
		!isBotAdministrator &&
		(!member ||
			!member
				.permissionsIn(channel)
				.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
	) {
		response.status(403).json({ error: "You need access to view channel messages and history" });
		return null;
	}

	const botMember = adminGuild.guild.members.me ?? (await adminGuild.guild.members.fetchMe());
	const botPermissions = botMember.permissionsIn(channel);
	const requiredBotPermissions = [
		[PermissionFlagsBits.ViewChannel, "View Channel"],
		[PermissionFlagsBits.ReadMessageHistory, "Read Message History"],
		[PermissionFlagsBits.ManageMessages, "Manage Messages"],
	] as const;
	const missingBotPermissions = requiredBotPermissions
		.filter(([permission]) => !botPermissions.has(permission))
		.map(([, label]) => label);
	if (missingBotPermissions.length > 0) {
		response.status(403).json({
			error: `The bot is missing channel permissions: ${missingBotPermissions.join(", ")}`,
		});
		return null;
	}

	return { guild: adminGuild.guild, channel, userId, member, botMember, isBotAdministrator };
}

export default defineRouter("/guilds", [
	{
		method: "post",
		path: "/:guildId/messages/preview",
		tags: ["Guild"],
		summary: "Preview messages before clearing them",
		errorMessage: "Failed to preview messages for clearing",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		requestBody: {
			required: true,
			content: { "application/json": { schema: adminGuildClearRequestSchema } },
		},
		responses: {
			200: { description: "Matching messages available for deletion", schema: adminGuildClearPreviewSchema },
			400: { description: "Invalid guild, channel, or filters", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Manage Server access or channel permissions required", schema: errorResponseSchema },
			404: { description: "Guild or channel not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to preview messages for clearing", schema: errorResponseSchema },
		},
		middleware: clearMessageMiddleware,
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const body = adminGuildClearRequestSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid clear request" });
			}
			const session: AuthSession | undefined = response.locals.authSession;
			if (!session) return response.status(401).json({ error: "Authentication required" });
			const access = await getClearMessageAccess({
				guildId,
				channelId: body.data.channelId,
				response,
				session,
			});
			if (!access) return;

			pruneClearState();
			const fetchedMessages = await access.channel.messages.fetch({ limit: clearScanLimit });
			const textFilter = body.data.text?.trim() ?? "";
			const matchingMessages = [...fetchedMessages.values()]
				.filter(
					(message) =>
						(!body.data.userId || message.author.id === body.data.userId) &&
						(!textFilter || message.content.includes(textFilter)),
				)
				.sort((first, second) => second.createdTimestamp - first.createdTimestamp);
			const messages = matchingMessages.slice(0, body.data.count);
			const now = Date.now();
			const bulkDeletableBefore = now - bulkDeleteAgeMs;
			const bulkDeleteCount = messages.filter(
				(message) => message.createdTimestamp >= bulkDeletableBefore,
			).length;
			const individualDeleteCount = messages.length - bulkDeleteCount;
			const previewId = randomUUID();
			const expiresAt = now + clearPreviewLifetimeMs;
			clearPreviews.set(previewId, {
				id: previewId,
				guildId,
				userId: access.userId,
				channelId: access.channel.id,
				count: body.data.count,
				targetUserId: body.data.userId ?? null,
				textFilter: textFilter || null,
				scannedCount: fetchedMessages.size,
				matchedCount: matchingMessages.length,
				messages,
				expiresAt,
			});
			return response.status(200).json({
				previewId,
				guild: { id: access.guild.id, name: access.guild.name },
				channel: { id: access.channel.id, name: access.channel.name },
				scannedCount: fetchedMessages.size,
				matchedCount: matchingMessages.length,
				deleteCount: messages.length,
				bulkDeleteCount,
				individualDeleteCount,
				olderThanBulkDeleteLimit: individualDeleteCount,
				scanLimitReached: fetchedMessages.size === clearScanLimit,
				expiresAt,
				messages: messages.map((message) => ({
					id: message.id,
					author: {
						id: message.author.id,
						username: message.author.username,
						displayName:
							message.member?.displayName ?? message.author.globalName ?? message.author.username,
					},
					content: message.content || "(No text content)",
					createdTimestampMs: message.createdTimestamp,
					jumpUrl: message.url,
				})),
			});
		},
	},
	{
		method: "post",
		path: "/:guildId/messages/clear",
		tags: ["Guild"],
		summary: "Clear messages from a reviewed preview",
		errorMessage: "Failed to start clearing messages",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: z.object({ previewId: z.string().uuid(), confirm: z.literal(true) }),
				},
			},
		},
		responses: {
			202: { description: "Message deletion started", schema: z.object({ jobId: z.string().uuid() }) },
			400: { description: "Invalid guild or confirmation", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Manage Server access or channel permissions required", schema: errorResponseSchema },
			404: { description: "Guild, channel, or preview not found", schema: errorResponseSchema },
			409: {
				description: "Bot is not a guild member or preview expired, empty, or already used",
				schema: errorResponseSchema,
			},
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to start clearing messages", schema: errorResponseSchema },
		},
		middleware: clearMessageMiddleware,
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const body = z.object({ previewId: z.string().uuid(), confirm: z.literal(true) }).safeParse(request.body);
			if (!body.success) {
				return response
					.status(400)
					.json({ error: body.error.issues[0]?.message ?? "Confirmation is required" });
			}
			const session: AuthSession | undefined = response.locals.authSession;
			if (!session) return response.status(401).json({ error: "Authentication required" });
			const preview = clearPreviews.get(body.data.previewId);
			if (!preview || preview.guildId !== guildId || preview.expiresAt <= Date.now()) {
				clearPreviews.delete(body.data.previewId);
				return response.status(404).json({ error: "Preview not found or expired. Create a new preview." });
			}
			const access = await getClearMessageAccess({
				guildId,
				channelId: preview.channelId,
				response,
				session,
			});
			if (!access) return;
			if (preview.userId !== access.userId) {
				return response.status(403).json({ error: "Only the user who created this preview can confirm it" });
			}
			if (clearPreviews.get(preview.id) !== preview) {
				return response
					.status(409)
					.json({ error: "This preview has already been used. Create a new preview." });
			}
			if (preview.messages.length === 0) {
				return response.status(409).json({ error: "This preview has no matching messages" });
			}

			clearPreviews.delete(preview.id);
			pruneClearState();
			const job = startClearMessageJob({
				guild: access.guild,
				channels: [access.channel],
				creatorDiscordId: access.userId,
				authorizationChannelId: access.channel.id,
				count: preview.count,
				selectedChannelId: preview.channelId,
				...(preview.targetUserId ? { targetUserId: preview.targetUserId } : {}),
				...(preview.textFilter ? { text: preview.textFilter } : {}),
				presetMessages: preview.messages,
				presetScannedCount: preview.scannedCount,
				presetMatchedCount: preview.matchedCount,
				validateChannel: (channel) => {
					const userCanViewChannel =
						access.isBotAdministrator ||
						(access.member !== null &&
							access.member
								.permissionsIn(channel)
								.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]));
					if (!userCanViewChannel) {
						return "You need access to view channel messages and history";
					}
					const botPermissions = access.botMember.permissionsIn(channel);
					const requiredPermissions = [
						[PermissionFlagsBits.ViewChannel, "View Channel"],
						[PermissionFlagsBits.ReadMessageHistory, "Read Message History"],
						[PermissionFlagsBits.ManageMessages, "Manage Messages"],
					] as const;
					const missingPermissions = requiredPermissions
						.filter(([permission]) => !botPermissions.has(permission))
						.map(([, label]) => label);
					return missingPermissions.length > 0
						? `The bot is missing channel permissions: ${missingPermissions.join(", ")}`
						: null;
				},
			});
			return response.status(202).json({ jobId: job.jobId });
		},
	},
	{
		method: "put",
		path: "/:guildId/commands",
		tags: ["Admin Guilds"],
		summary: "Deploy commands in a registered guild",
		errorMessage: "Failed to deploy guild commands",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: { description: "Guild commands deployed", schema: adminGuildCommandsResultSchema },
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to deploy guild commands", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => updateGuildCommands(request, response, "deploy"),
	},
	{
		method: "delete",
		path: "/:guildId/commands",
		tags: ["Admin Guilds"],
		summary: "Undeploy commands from a registered guild",
		errorMessage: "Failed to undeploy guild commands",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: { description: "Guild commands undeployed", schema: adminGuildCommandsResultSchema },
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to undeploy guild commands", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => updateGuildCommands(request, response, "undeploy"),
	},
	{
		method: "delete",
		path: "/:guildId/kick",
		tags: ["Admin Guilds"],
		summary: "Remove the bot from a registered guild",
		errorMessage: "Failed to leave guild",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		requestBody: {
			required: true,
			content: { "application/json": { schema: adminGuildKickSchema } },
		},
		responses: {
			200: {
				description: "Bot left the guild; departure message may be unavailable",
				schema: z.object({
					departureMessage: z
						.object({
							channelId: z.string(),
							channelName: z.string(),
							messageUrl: z.string().url(),
							messageType: z.enum(["embed", "normal"]),
						})
						.nullable(),
				}),
			},
			400: { description: "Invalid guild ID, channel ID, confirmation, or message", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: {
				description:
					"Bot is not a guild member, the selected channel is unavailable, or a kick is already in progress",
				schema: errorResponseSchema,
			},
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to leave guild", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const body = adminGuildKickSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid kick request" });
			}
			if (activeGuildKicks.has(guildId)) {
				return response.status(409).json({ error: "A kick is already in progress for this guild" });
			}
			activeGuildKicks.add(guildId);
			try {
				const adminGuild = await getAdminGuildForAction(guildId);
				switch (adminGuild.status) {
					case "not_found":
						return response.status(404).json({ error: "Guild not found" });
					case "not_member":
						return response.status(409).json({ error: "Bot is not a guild member" });
					case "unavailable":
						return response.status(503).json({ error: "Guild is unavailable" });
				}
				const session: AuthSession | undefined = response.locals.authSession;
				if (!session) {
					return response.status(401).json({ error: "Authentication required" });
				}
				if (body.data.channelId) {
					const channel = await adminGuild.guild.channels
						.fetch(body.data.channelId)
						.catch((error: unknown) => {
							if (error instanceof DiscordAPIError && error.code === 10003) return null;
							throw error;
						});
					const botMember = adminGuild.guild.members.me ?? (await adminGuild.guild.members.fetchMe());
					if (
						!channel ||
						channel.guildId !== guildId ||
						!canSendMessage({
							channel,
							botMember,
							permissions: [
								PermissionFlagsBits.ViewChannel,
								PermissionFlagsBits.SendMessages,
								PermissionFlagsBits.EmbedLinks,
							],
						})
					) {
						return response.status(409).json({
							error: "The selected channel is unavailable for sending a departure message. Refresh channels and try again.",
						});
					}
				}
				const message = body.data.message?.trim();
				const result = await kickGuild({
					guild: adminGuild.guild,
					config: getConfig(),
					...(message ? { additionalMessage: message } : {}),
					...(body.data.channelId !== undefined ? { channelId: body.data.channelId } : {}),
					invoker: { userName: session.user.name, userId: session.user.id },
				});
				if (!result.success) {
					return response.status(500).json({
						error: result.departureMessage
							? "Failed to leave the guild, but a departure message was sent"
							: "Failed to leave the guild",
					});
				}
				return response.status(200).json({ departureMessage: result.departureMessage });
			} finally {
				activeGuildKicks.delete(guildId);
			}
		},
	},
	{
		method: "put",
		path: "/:guildId/messages",
		tags: ["Admin Guilds"],
		summary: "Send an admin message to a registered guild",
		errorMessage: "Failed to send admin guild message",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		requestBody: {
			required: true,
			content: { "application/json": { schema: adminGuildMessageSchema } },
		},
		responses: {
			200: {
				description: "Admin message sent to the selected guild channel",
				schema: z.object({ channelId: z.string(), channelName: z.string(), messageUrl: z.string().url() }),
			},
			400: { description: "Invalid guild ID, channel ID, or message", schema: errorResponseSchema },
			403: {
				description: "Admin access required or bot cannot send an embedded message to the selected channel",
				schema: errorResponseSchema.extend({ code: z.literal("BOT_CHANNEL_PERMISSION_DENIED").optional() }),
			},
			404: { description: "Guild or channel not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to send admin guild message", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const body = adminGuildMessageSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid message request" });
			}

			const adminGuild = await getAdminGuildForAction(guildId);
			switch (adminGuild.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
			}

			const channel = await adminGuild.guild.channels.fetch(body.data.channelId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === 10003) return null;
				throw error;
			});
			if (!channel || channel.guildId !== guildId) {
				return response.status(404).json({ error: "Channel not found" });
			}
			if (!channel.isTextBased()) {
				return response.status(400).json({ error: "Channel cannot receive messages" });
			}

			const botMember = adminGuild.guild.members.me ?? (await adminGuild.guild.members.fetchMe());
			if (
				!canSendMessage({
					channel,
					botMember,
					permissions: [
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.EmbedLinks,
					],
				})
			) {
				return response.status(403).json({
					error: "Bot cannot send an embedded message to this channel",
					code: "BOT_CHANNEL_PERMISSION_DENIED",
				});
			}

			const session: AuthSession | undefined = response.locals.authSession;
			const sentMessage = await sendGuildAdminMessage({
				guild: adminGuild.guild,
				message: body.data.message,
				config: getConfig(),
				channelId: body.data.channelId,
				...(session ? { invoker: { userName: session.user.name, userId: session.user.id } } : {}),
			});
			return response.status(200).json(sentMessage);
		},
	},
	{
		method: "post",
		path: "/:guildId/invite",
		tags: ["Admin Guilds"],
		summary: "Get or create an invite for a registered guild",
		errorMessage: "Failed to get admin guild invite",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: { description: "Existing or newly created guild invite", schema: adminGuildInviteSchema },
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get admin guild invite", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}

			const adminGuild = await getAdminGuildForAction(guildId);
			switch (adminGuild.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
			}

			const invite = await getGuildInvite(adminGuild.guild);
			return response.status(200).json({
				url: invite.url,
				channel: invite.channel ? { id: invite.channel.id, name: invite.channel.name ?? null } : null,
				maxAge: invite.maxAge ?? null,
				createdTimestampMs: invite.createdTimestamp ?? null,
				expiresTimestampMs: invite.expiresTimestamp ?? null,
				uses: invite.uses ?? null,
				maxUses: invite.maxUses ?? null,
				temporary: invite.temporary,
				inviter: invite.inviter ? { id: invite.inviter.id, username: invite.inviter.username } : null,
			});
		},
	},
	{
		method: "get",
		path: "/",
		tags: ["Admin Guilds"],
		summary: "List registered guilds",
		errorMessage: "Failed to list guilds",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Registered guilds with current Discord membership and available details",
				schema: z.array(adminGuildSchema),
			},
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (_request, response) => {
			const guilds = await listGuilds({
				keys: [
					...extendedGuildKeys,
					"isActiveMember",
					"memberCount",
					"joinedTimestampMs",
					"guildCommandDeploymentState",
				],
			});
			return response.status(200).json(guilds);
		},
	},
	{
		method: "get",
		path: "/:guildId",
		tags: ["Admin Guilds"],
		summary: "Get a registered guild as an admin",
		errorMessage: "Failed to get guild",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: {
				description: "Registered guild details including command deployment",
				schema: adminGuildDetailsSchema,
			},
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			500: { description: "Failed to get guild", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const guild = await getGuildState({ guildId, keys: allGuildKeys });
			if (!guild) {
				return response.status(404).json({ error: "Guild not found" });
			}
			return response.status(200).json(guild);
		},
	},
]);
