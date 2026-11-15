import { z } from "zod";

import { requireAdmin, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { getDirectMessagePage, listDirectMessageConversations } from "../../../services/directMessages.js";
import { apiUserSchema } from "../schemas.js";

const tags = ["Admin Direct Messages"];
const security = [{ sessionBearer: [] }];
const middleware = [requireSession, requireAdmin, requireDatabase, requireDiscord];
const snowflake = z.string().regex(/^\d{17,20}$/u);
const conversationParameter = { name: "userId", in: "path" as const, required: true, schema: snowflake };
const messageSchema = z.object({
	id: z.string(),
	content: z.string(),
	author: apiUserSchema,
	createdTimestampMs: z.number(),
	attachments: z.array(z.object({ name: z.string(), url: z.string() })),
	embeds: z.array(
		z.object({
			title: z.string().nullable(),
			description: z.string().nullable(),
			fields: z.array(z.object({ name: z.string(), value: z.string() })),
		}),
	),
	stickers: z.array(z.object({ name: z.string(), url: z.string() })),
});
const responses = {
	400: { description: "Invalid request", schema: errorResponseSchema },
	401: { description: "Authentication required", schema: errorResponseSchema },
	403: { description: "Bot administrator access required", schema: errorResponseSchema },
	404: { description: "Conversation not found", schema: errorResponseSchema },
	503: { description: "Database or Discord unavailable", schema: errorResponseSchema },
	500: { description: "Request failed", schema: errorResponseSchema },
};

export default defineRouter("/direct-messages", [
	{
		method: "get",
		path: "/",
		tags,
		summary: "List discovered direct message conversations",
		errorMessage: "Failed to list direct message conversations",
		security,
		parameters: [{ name: "page", in: "query", schema: z.coerce.number().int().min(1).default(1) }],
		responses: {
			...responses,
			200: {
				description: "Conversations ordered by most recently received message",
				schema: z.object({
					items: z.array(z.object({ user: apiUserSchema, lastReceivedAt: z.string() })),
					hasMore: z.boolean(),
				}),
			},
		},
		middleware,
		handler: async (request, response) => {
			response.set("Cache-Control", "no-store");
			const query = z
				.object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
				.safeParse(request.query);
			if (!query.success) return response.status(400).json({ error: "Invalid page" });
			return response.json(await listDirectMessageConversations(query.data.page));
		},
	},
	{
		method: "get",
		path: "/:userId/messages",
		tags,
		summary: "Read a discovered direct message conversation from Discord",
		errorMessage: "Failed to read direct messages from Discord",
		security,
		parameters: [
			conversationParameter,
			{
				name: "before",
				in: "query",
				schema: snowflake,
				description: "Fetch messages older than this message ID",
			},
		],
		responses: {
			...responses,
			200: {
				description: "Messages in chronological order",
				schema: z.object({ messages: z.array(messageSchema), nextBefore: z.string().nullable() }),
			},
		},
		middleware,
		handler: async (request, response) => {
			response.set("Cache-Control", "no-store");
			const userId = snowflake.safeParse(request.params.userId);
			const query = z.object({ before: snowflake.optional() }).safeParse(request.query);
			if (!userId.success || !query.success)
				return response.status(400).json({ error: "Invalid conversation or cursor" });
			const page = await getDirectMessagePage({ userId: userId.data, before: query.data.before });
			if (!page) return response.status(404).json({ error: "Conversation not found" });
			return response.json(page);
		},
	},
]);
