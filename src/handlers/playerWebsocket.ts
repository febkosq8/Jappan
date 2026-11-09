import { z } from "zod";
import type { PlayerQueue } from "../helpers/player.js";
import { runPlayerControl, playerControlSchema } from "../helpers/playerControl.js";
import {
	consumeSocketRateLimit,
	type WebsocketAck,
	type WebsocketResult,
	type WebsocketSocket,
} from "../helpers/websocket.js";
import { logger } from "../services/logger.js";
import { getQueueBySessionId, isPlayerAvailable } from "../services/player.js";
import { resolvePlayerActor } from "../services/playerAccess.js";
import {
	getSocketPlayerUser,
	isSubscribedToPlayerSession,
	subscribeToPlayerSession,
	unsubscribeFromPlayerSession,
} from "../services/playerWebsocket.js";
import { MAX_PLAY_QUERY_LENGTH } from "../helpers/playerLimits.js";
import { getPlayerSuggestions } from "../services/playerSearch.js";
import { playerSessionIdPattern } from "./playerSession.js";

type Failure = Extract<WebsocketResult, { ok: false }>;

function once<Value>(create: () => Value): () => Value {
	let value: Value | undefined;
	return () => (value ??= create());
}

/**
 * Built on first use, not at import: this module sits in an import cycle with the player actions
 * (bot -> shutdown -> app -> websocket), so the schemas it borrows are not ready while it loads.
 */
const getPayloadSchemas = once(() => {
	const sessionId = z.string().regex(playerSessionIdPattern);
	return {
		session: z.strictObject({ sessionId }),
		control: z.strictObject({ sessionId, control: playerControlSchema }),
		suggestions: z.strictObject({ sessionId, query: z.string().max(MAX_PLAY_QUERY_LENGTH) }),
	};
});

const invalidPayload: Failure = { ok: false, status: 400, error: "Invalid request" };
const notSubscribed: Failure = { ok: false, status: 403, error: "Open the player session before using it" };
const voiceChannelRequired: Failure = {
	ok: false,
	status: 403,
	error: "You must be in this player's voice channel to use it",
};

/** Resolves a session ID to its active queue; unknown and ended sessions share one 404 so IDs cannot be probed. */
function findPlayerQueue(sessionId: string): PlayerQueue | Failure {
	if (!isPlayerAvailable()) {
		return { ok: false, status: 503, error: "Player is unavailable" };
	}
	return getQueueBySessionId(sessionId) ?? { ok: false, status: 404, error: "Player session not found or has ended" };
}

function isFailure(value: PlayerQueue | Failure): value is Failure {
	return "ok" in value;
}

/** Runs one request and always answers it: rate-limited, failed or done. A client that sends no ack gets none. */
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
			logger.error("WEBSOCKET", "Player socket event failed", {
				event,
				user: socket.data.discordAccountId ?? socket.data.authSession.user.id,
				error: error instanceof Error ? error.message : String(error),
			});
			result = { ok: false, status: 500, error: "The player request failed" };
		}
	}
	if (typeof ack === "function") {
		ack(result);
	}
}

export function registerPlayerSocketHandlers(socket: WebsocketSocket): void {
	socket.on("player:subscribe", (payload, ack) => {
		void respond({
			socket,
			event: "player:subscribe",
			ack,
			work: async () => {
				const parsed = getPayloadSchemas().session.safeParse(payload);
				if (!parsed.success) {
					return invalidPayload;
				}
				const queue = findPlayerQueue(parsed.data.sessionId);
				return isFailure(queue) ? queue : subscribeToPlayerSession({ socket, queue });
			},
		});
	});
	socket.on("player:unsubscribe", (payload, ack) => {
		void respond({
			socket,
			event: "player:unsubscribe",
			ack,
			work: async () => {
				const parsed = getPayloadSchemas().session.safeParse(payload);
				if (!parsed.success) {
					return invalidPayload;
				}
				await unsubscribeFromPlayerSession({ socket, sessionId: parsed.data.sessionId });
				return { ok: true };
			},
		});
	});
	socket.on("player:control", (payload, ack) => {
		void respond({
			socket,
			event: "player:control",
			ack,
			work: async () => {
				const parsed = getPayloadSchemas().control.safeParse(payload);
				if (!parsed.success) {
					return invalidPayload;
				}
				const { sessionId, control } = parsed.data;
				if (!isSubscribedToPlayerSession({ socket, sessionId })) {
					return notSubscribed;
				}
				const queue = findPlayerQueue(sessionId);
				if (isFailure(queue)) {
					return queue;
				}
				// Resolved again for every command: the user may have left the voice channel or the server since subscribing
				const actorResult = await resolvePlayerActor({ queue, user: getSocketPlayerUser(socket) });
				if (!actorResult.success) {
					return { ok: false, status: actorResult.status, error: actorResult.error };
				}
				const result = await runPlayerControl({ queue, actor: actorResult.actor, control });
				if (!result.success) {
					return { ok: false, status: result.status, error: result.error };
				}
				return result.notice ? { ok: true, notice: result.notice } : { ok: true };
			},
		});
	});
	socket.on("player:suggestions", (payload, ack) => {
		void respond({
			socket,
			event: "player:suggestions",
			ack,
			work: async () => {
				const parsed = getPayloadSchemas().suggestions.safeParse(payload);
				if (!parsed.success) {
					return invalidPayload;
				}
				const { sessionId, query } = parsed.data;
				if (!isSubscribedToPlayerSession({ socket, sessionId })) {
					return notSubscribed;
				}
				const queue = findPlayerQueue(sessionId);
				if (isFailure(queue)) {
					return queue;
				}
				const actorResult = await resolvePlayerActor({ queue, user: getSocketPlayerUser(socket) });
				if (!actorResult.success) {
					return { ok: false, status: actorResult.status, error: actorResult.error };
				}
				if (!actorResult.actor.inVoiceChannel) {
					return voiceChannelRequired;
				}
				const suggestions = await getPlayerSuggestions({ query, userId: actorResult.actor.userId });
				return { ok: true, suggestions };
			},
		});
	});
}
