import { DiscordAPIError } from "discord.js";
import { z } from "zod";

import { isBotConnected } from "../bot.js";
import {
	consumeSocketRateLimit,
	type WebsocketAck,
	type WebsocketResult,
	type WebsocketSocket,
} from "../helpers/websocket.js";
import { isDatabaseConnected } from "../services/database.js";
import { getDirectMessagePage, listDirectMessageConversations, sendDirectMessage } from "../services/directMessages.js";
import {
	isDirectMessageSubscriber,
	subscribeToDirectMessages,
	unsubscribeFromDirectMessages,
} from "../services/directMessageWebsocket.js";
import { logger } from "../services/logger.js";

const snowflake = z.string().regex(/^\d{17,20}$/u);
const emptySchema = z.strictObject({});
const listSchema = z.strictObject({ page: z.number().int().min(1).max(100000) });
const historySchema = z.strictObject({ userId: snowflake, before: snowflake.optional() });
const sendSchema = z.strictObject({ userId: snowflake, content: z.string().trim().min(1).max(2000) });
type Failure = Extract<WebsocketResult, { ok: false }>;
const invalidPayload: Failure = { ok: false, status: 400, error: "Invalid direct message request" };
const notFound: Failure = { ok: false, status: 404, error: "Conversation not found" };

async function respond<Data extends object>({
	socket,
	event,
	ack,
	work,
	allowCleanup = false,
}: {
	socket: WebsocketSocket;
	event: string;
	ack: WebsocketAck<Data> | undefined;
	work: () => Promise<WebsocketResult<Data>>;
	allowCleanup?: boolean;
}): Promise<void> {
	let result: WebsocketResult<Data>;
	if (consumeSocketRateLimit(socket)) {
		result = { ok: false, status: 429, error: "Too many requests, slow down" };
	} else if (!allowCleanup && !socket.data.user.isAdmin) {
		result = { ok: false, status: 403, error: "Bot administrator access required" };
	} else if (!allowCleanup && (!isDatabaseConnected() || !isBotConnected())) {
		result = { ok: false, status: 503, error: "Database or Discord is unavailable" };
	} else {
		try {
			result = await work();
		} catch (error: unknown) {
			if (error instanceof DiscordAPIError && error.code === 50007) {
				result = { ok: false, status: 422, error: "Discord cannot deliver messages to this user." };
			} else {
				logger.error("WEBSOCKET", "Direct message socket event failed", {
					event,
					socket: socket.id,
					error: error instanceof Error ? error.message : String(error),
				});
				result = { ok: false, status: 500, error: "The direct message request failed" };
			}
		}
	}
	if (typeof ack === "function") ack(result);
}

export function registerDirectMessageSocketHandlers(socket: WebsocketSocket): void {
	socket.on("direct-messages:subscribe", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:subscribe",
			ack,
			work: async () => {
				if (!emptySchema.safeParse(payload).success) return invalidPayload;
				await subscribeToDirectMessages(socket);
				return { ok: true };
			},
		});
	});
	socket.on("direct-messages:unsubscribe", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:unsubscribe",
			ack,
			allowCleanup: true,
			work: async () => {
				if (!emptySchema.safeParse(payload).success) return invalidPayload;
				await unsubscribeFromDirectMessages(socket);
				return { ok: true };
			},
		});
	});
	socket.on("direct-messages:list", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:list",
			ack,
			work: async () => {
				const parsed = listSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				if (!isDirectMessageSubscriber(socket))
					return { ok: false, status: 403, error: "Open the inbox first" };
				return { ok: true, conversations: await listDirectMessageConversations(parsed.data.page) };
			},
		});
	});
	socket.on("direct-messages:history", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:history",
			ack,
			work: async () => {
				const parsed = historySchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				if (!isDirectMessageSubscriber(socket))
					return { ok: false, status: 403, error: "Open the inbox first" };
				const page = await getDirectMessagePage(parsed.data);
				return page ? { ok: true, page } : notFound;
			},
		});
	});
	socket.on("direct-messages:send", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:send",
			ack,
			work: async () => {
				const parsed = sendSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				if (!isDirectMessageSubscriber(socket))
					return { ok: false, status: 403, error: "Open the inbox first" };
				const message = await sendDirectMessage(parsed.data);
				if (!message) return notFound;
				logger.info("ADMIN", "Admin sent a bot direct message", {
					adminId: socket.data.authSession.user.id,
					userId: parsed.data.userId,
					messageId: message.id,
				});
				return { ok: true, message };
			},
		});
	});
}
