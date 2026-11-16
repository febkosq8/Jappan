import { z } from "zod";

import { requireAdmin, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { listQueryParameters, listQuerySchema, paginatedListSchema } from "../../../helpers/list.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { listDirectMessageConversations } from "../../../services/directMessages.js";
import { apiUserSchema } from "../schemas.js";

const tags = ["Admin Direct Messages"];
const security = [{ sessionBearer: [] }];
const middleware = [requireDatabase, requireDiscord, requireSession, requireAdmin];
const conversationSchema = z.object({
	user: apiUserSchema,
	lastReceivedAt: z.string(),
	unread: z.boolean(),
	lastReadAt: z.string().nullable(),
	lastReadBy: z.object({ id: z.string(), username: z.string() }).nullable(),
});
const userIdSchema = z.string().regex(/^\d{17,20}$/u);
const conversationListQuerySchema = listQuerySchema
	.pick({ page: true, perPageLimit: true })
	.extend({ userId: userIdSchema.optional() });
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
		parameters: [
			...listQueryParameters(conversationSchema).filter(({ name }) => name === "page" || name === "perPageLimit"),
			{ name: "userId", in: "query", schema: userIdSchema, description: "Filter by conversation user ID" },
		],
		responses: {
			...responses,
			200: {
				description: "Conversations ordered by most recently received message",
				schema: paginatedListSchema(conversationSchema),
			},
		},
		middleware,
		handler: async (request, response) => {
			const query = conversationListQuerySchema.safeParse(request.query);
			if (!query.success)
				return response.status(400).json({ error: query.error.issues[0]?.message ?? "Invalid list query" });
			const conversations = await listDirectMessageConversations(query.data);
			return response.json(conversations);
		},
	},
]);
