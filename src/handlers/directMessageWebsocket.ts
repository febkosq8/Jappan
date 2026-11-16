import { DiscordAPIError } from "discord.js";
import { z } from "zod";

import { getClient, isBotConnected } from "../bot.js";
import {
	consumeSocketRateLimit,
	type WebsocketAck,
	type WebsocketResult,
	type WebsocketSocket,
} from "../helpers/websocket.js";
import { isDatabaseConnected } from "../services/database.js";
import {
	getDirectMessagePage,
	getUnreadDirectMessageCount,
	markDirectMessageRead,
	sendDirectMessage,
} from "../services/directMessages.js";
import {
	isDirectMessageInboxSubscriber,
	isDirectMessageSubscriber,
	subscribeToDirectMessageInbox,
	subscribeToDirectMessages,
	unsubscribeFromDirectMessageInbox,
	unsubscribeFromDirectMessages,
} from "../services/directMessageWebsocket.js";
import { logger } from "../services/logger.js";

const snowflake = z.string().regex(/^\d{17,20}$/u);
const conversationSchema = z.strictObject({ userId: snowflake });
const historySchema = z.strictObject({ userId: snowflake, before: snowflake.optional() });
const sendSchema = z.strictObject({ userId: snowflake, content: z.string().trim().min(1).max(2000) });
const readSchema = z.strictObject({ userId: snowflake, messageId: snowflake.nullable() });
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
	if (!allowCleanup && consumeSocketRateLimit(socket)) {
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
	let subscriptionTransition = Promise.resolve();
	function transition<Data extends object>(
		work: () => Promise<WebsocketResult<Data>>,
	): Promise<WebsocketResult<Data>> {
		const result = subscriptionTransition.then(work);
		subscriptionTransition = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	socket.on("direct-messages:inbox-subscribe", (ack) => {
		void respond({
			socket,
			event: "direct-messages:inbox-subscribe",
			ack,
			work: () =>
				transition<{ unreadCount: number }>(async () => {
					if (!(await subscribeToDirectMessageInbox(socket))) {
						await unsubscribeFromDirectMessageInbox(socket);
						return { ok: false, status: 403, error: "Bot administrator access required" };
					}
					const unreadCount = await getUnreadDirectMessageCount();
					if (!socket.data.user.isAdmin) {
						await unsubscribeFromDirectMessageInbox(socket);
						return { ok: false, status: 403, error: "Bot administrator access required" };
					}
					return { ok: true, unreadCount };
				}),
		});
	});
	socket.on("direct-messages:inbox-unsubscribe", (ack) => {
		void respond({
			socket,
			event: "direct-messages:inbox-unsubscribe",
			ack,
			allowCleanup: true,
			work: () =>
				transition(async () => {
					await unsubscribeFromDirectMessageInbox(socket);
					return { ok: true };
				}),
		});
	});
	socket.on("direct-messages:unread-count", (ack) => {
		void respond({
			socket,
			event: "direct-messages:unread-count",
			ack,
			work: async () => {
				if (!isDirectMessageInboxSubscriber(socket))
					return { ok: false, status: 403, error: "Subscribe to the inbox first" };
				const unreadCount = await getUnreadDirectMessageCount();
				if (!socket.data.user.isAdmin)
					return { ok: false, status: 403, error: "Bot administrator access required" };
				return { ok: true, unreadCount };
			},
		});
	});
	socket.on("direct-messages:read", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:read",
			ack,
			work: async () => {
				const parsed = readSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				if (!isDirectMessageSubscriber({ socket, userId: parsed.data.userId }))
					return { ok: false, status: 403, error: "Open the conversation first" };
				await markDirectMessageRead({ ...parsed.data, reader: socket.data.user });
				return { ok: true };
			},
		});
	});
	socket.on("direct-messages:subscribe", (payload, ack) => {
		void respond({
			socket,
			event: "direct-messages:subscribe",
			ack,
			work: async () => {
				const parsed = conversationSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				return transition(async () => {
					if (!socket.data.user.isAdmin)
						return { ok: false, status: 403, error: "Bot administrator access required" };
					const bot = getClient().user;
					if (!bot) throw new Error("Discord bot user is unavailable");
					const subscribed = await subscribeToDirectMessages({ socket, userId: parsed.data.userId });
					if (!socket.data.user.isAdmin) {
						await unsubscribeFromDirectMessages({ socket, userId: parsed.data.userId });
						return { ok: false, status: 403, error: "Bot administrator access required" };
					}
					if (!subscribed) return notFound;
					return {
						ok: true,
						bot: { id: bot.id, name: bot.username, avatarUrl: bot.displayAvatarURL() },
					};
				});
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
				const parsed = conversationSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				return transition(async () => {
					await unsubscribeFromDirectMessages({ socket, userId: parsed.data.userId });
					return { ok: true };
				});
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
				if (!isDirectMessageSubscriber({ socket, userId: parsed.data.userId }))
					return { ok: false, status: 403, error: "Open the conversation first" };
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
				if (!isDirectMessageSubscriber({ socket, userId: parsed.data.userId }))
					return { ok: false, status: 403, error: "Open the conversation first" };
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
