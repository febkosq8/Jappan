import { z } from "zod";
import { DiscordAPIError, PermissionFlagsBits } from "discord.js";

import { getClient } from "../../../../bot.js";
import { requireAdmin, requireSession } from "../../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import {
	getAdminGuild,
	getAdminGuildForAction,
	getGuildInvite,
	listAdminGuildChannels,
	listAllGuilds,
	sendGuildAdminMessage,
} from "../../../../services/adminGuild.js";
import type { AuthSession } from "../../../../services/auth.js";
import { getConfig } from "../../../../services/config.js";

const guildSchema = z.object({
	id: z.string(),
	name: z.string(),
	isActiveMember: z.boolean(),
	icon: z.string().nullable().optional(),
	memberCount: z.number().int().optional(),
	channelCount: z.number().int().nonnegative().optional(),
	createdAt: z.number().int().optional(),
	description: z.string().nullable().optional(),
	joinedTimestamp: z.number().int().optional(),
	systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
	permissions: z.array(z.string()).optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: z.object({ userId: z.string(), avatarUrl: z.string(), username: z.string() }).optional(),
});

const preferenceEntitySchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

const guildDetailsSchema = guildSchema.extend({
	discoveredAt: z.number().int().nullable(),
	guildCommandDeployment: z
		.object({ deployed: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
		.nullable(),
	preferences: z.object({
		auditLog: z.object({
			enabled: z.boolean(),
			channel: preferenceEntitySchema,
			fullVerbosity: z.boolean(),
		}),
		leveling: z.object({
			enabled: z.boolean(),
			threshold: z.number().nullable(),
			role: preferenceEntitySchema,
		}),
		memberAnnouncements: z.object({
			joinEnabled: z.boolean(),
			leaveEnabled: z.boolean(),
			joinChannel: preferenceEntitySchema,
			leaveChannel: preferenceEntitySchema,
		}),
		warnings: z.object({
			timeoutThreshold: z.number().nullable(),
			timeoutDurationHours: z.number().nullable(),
			banThreshold: z.number().nullable(),
			auditChannel: preferenceEntitySchema,
		}),
	}),
});

const adminGuildMessageSchema = z.object({
	channelId: z.string().regex(/^\d{17,20}$/u, "Invalid channel ID"),
	message: z
		.string()
		.min(1, "Message cannot be empty")
		.max(4096, "Message must be 4096 characters or fewer")
		.refine((message) => message.trim().length > 0, "Message cannot be empty"),
});

const adminGuildInviteSchema = z.object({
	url: z.string().url(),
	channel: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
	maxAge: z.number().int().nullable(),
	createdTimestamp: z.number().int().nullable(),
	expiresTimestamp: z.number().int().nullable(),
	uses: z.number().int().nullable(),
	maxUses: z.number().int().nullable(),
	temporary: z.boolean(),
	inviter: z.object({ id: z.string(), username: z.string() }).nullable(),
});

export default defineRouter("/guilds", [
	{
		method: "post",
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
				description: "Bot cannot send an embedded message to the selected channel",
				schema: errorResponseSchema,
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

			const adminGuild = await getAdminGuildForAction(getClient(), guildId);
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
				!channel
					.permissionsFor(botMember)
					?.has([
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.EmbedLinks,
					])
			) {
				return response.status(403).json({ error: "Bot cannot send an embedded message to this channel" });
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

			const adminGuild = await getAdminGuildForAction(getClient(), guildId);
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
				createdTimestamp: invite.createdTimestamp ?? null,
				expiresTimestamp: invite.expiresTimestamp ?? null,
				uses: invite.uses ?? null,
				maxUses: invite.maxUses ?? null,
				temporary: invite.temporary,
				inviter: invite.inviter ? { id: invite.inviter.id, username: invite.inviter.username } : null,
			});
		},
	},
	{
		method: "get",
		path: "/:guildId/channels",
		tags: ["Admin Guilds"],
		summary: "List channels in a registered guild",
		errorMessage: "Failed to list guild channels",
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
				description: "Guild channels and categories, excluding threads",
				schema: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						type: z.number().int(),
						typeName: z.string(),
						createdAt: z.number().int(),
						parent: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
						position: z.number().int(),
						topic: z.string().nullable().optional(),
						nsfw: z.boolean().optional(),
						rateLimitPerUser: z.number().int().nullable().optional(),
						bitrate: z.number().int().optional(),
						userLimit: z.number().int().optional(),
					}),
				),
			},
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild channels", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const result = await listAdminGuildChannels(getClient(), guildId);
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
		path: "/",
		tags: ["Admin Guilds"],
		summary: "List registered guilds",
		errorMessage: "Failed to list guilds",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Registered guilds with current Discord membership and available details",
				schema: z.array(guildSchema),
			},
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (_request, response) => {
			const guilds = await listAllGuilds(getClient());
			return response.status(200).json(guilds);
		},
	},
	{
		method: "get",
		path: "/:guildId",
		tags: ["Admin Guilds"],
		summary: "Get a registered guild",
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
				description: "Registered guild with current Discord membership and available details",
				schema: guildDetailsSchema,
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
			const guild = await getAdminGuild(getClient(), guildId);
			if (!guild) {
				return response.status(404).json({ error: "Guild not found" });
			}
			return response.status(200).json(guild);
		},
	},
]);
