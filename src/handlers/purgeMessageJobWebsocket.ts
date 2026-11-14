import { z } from "zod";

import {
	consumeSocketRateLimit,
	type WebsocketAck,
	type WebsocketResult,
	type WebsocketSocket,
} from "../helpers/websocket.js";
import { logger } from "../services/logger.js";
import { subscribeToPurgeMessageJob, unsubscribeFromPurgeMessageJob } from "../services/purgeMessageJobWebsocket.js";

type Failure = Extract<WebsocketResult, { ok: false }>;

const requestSchema = z.strictObject({ jobId: z.string().uuid() });
const invalidPayload: Failure = { ok: false, status: 400, error: "Invalid request" };

async function respond<Data extends object>({
	socket,
	event,
	ack,
	work,
}: {
	socket: WebsocketSocket;
	event: string;
	ack: WebsocketAck<Data> | undefined;
	work: () => Promise<WebsocketResult<Data>>;
}): Promise<void> {
	let result: WebsocketResult<Data>;
	if (consumeSocketRateLimit(socket)) {
		result = { ok: false, status: 429, error: "Too many requests, slow down" };
	} else {
		try {
			result = await work();
		} catch (error: unknown) {
			logger.error("WEBSOCKET", "Message purge job socket event failed", {
				event,
				socket: socket.id,
				error: error instanceof Error ? error.message : String(error),
			});
			result = { ok: false, status: 500, error: "The message purge job request failed" };
		}
	}
	if (typeof ack === "function") ack(result);
}

export function registerPurgeMessageJobSocketHandlers(socket: WebsocketSocket): void {
	socket.on("purge-job:subscribe", (payload, ack) => {
		void respond({
			socket,
			event: "purge-job:subscribe",
			ack,
			work: async () => {
				const parsed = requestSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				return subscribeToPurgeMessageJob({ socket, jobId: parsed.data.jobId });
			},
		});
	});

	socket.on("purge-job:unsubscribe", (payload, ack) => {
		void respond({
			socket,
			event: "purge-job:unsubscribe",
			ack,
			work: async () => {
				const parsed = requestSchema.safeParse(payload);
				if (!parsed.success) return invalidPayload;
				await unsubscribeFromPurgeMessageJob({ socket, jobId: parsed.data.jobId });
				return { ok: true };
			},
		});
	});
}
