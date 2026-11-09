import type { RequestHandler } from "express";
import type { PlayerQueue } from "../helpers/player.js";
import { documentMiddlewareResponses } from "../helpers/middleware.js";
import type { AuthSession } from "../services/auth.js";
import { logger } from "../services/logger.js";
import { getQueueBySessionId, isPlayerAvailable } from "../services/player.js";
import {
	getPlayerWebUser,
	playerGuildMemberRequired,
	resolvePlayerActor,
	type PlayerActor,
} from "../services/playerAccess.js";

declare global {
	namespace Express {
		interface Locals {
			/** The live queue for the `:sessionId` in the URL, set by `requirePlayerSession`. */
			playerQueue: PlayerQueue;
			/** The signed-in user acting on that session, set by `requirePlayerGuildMember`. */
			playerActor: PlayerActor;
		}
	}
}
const playerAccessValidationFailed = "Player access validation failed";

export const playerSessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Resolves `:sessionId` to its active queue; unknown and expired sessions share one 404 so IDs cannot be probed. */
export const requirePlayerSession: RequestHandler = documentMiddlewareResponses(
	(request, response, next) => {
		const sessionId = request.params["sessionId"];
		if (typeof sessionId !== "string" || !playerSessionIdPattern.test(sessionId)) {
			response.status(400).json({ error: "Invalid player session ID" });
			return;
		}
		if (!isPlayerAvailable()) {
			response.status(503).json({ error: "Player is unavailable" });
			return;
		}
		const queue = getQueueBySessionId(sessionId);
		if (!queue) {
			response.status(404).json({ error: "Player session not found or has ended" });
			return;
		}
		response.locals.playerQueue = queue;
		next();
	},
	{
		400: "Invalid player session ID",
		404: "Player session not found or has ended",
		503: "Player is unavailable",
	},
);

/**
 * Identifies the acting user and requires them to be a member of the queue's guild; bot admins skip the
 * membership check. Stores the actor, including whether they are in the queue's voice channel, for the route.
 * Must run after `requireSession` and `requirePlayerSession`.
 */
export const requirePlayerGuildMember: RequestHandler = documentMiddlewareResponses(
	async (request, response, next) => {
		const session: AuthSession | undefined = response.locals.authSession;
		if (!session) {
			response.status(401).json({ error: "Authentication required" });
			return;
		}
		try {
			const result = await resolvePlayerActor({
				queue: response.locals.playerQueue,
				user: await getPlayerWebUser(session),
			});
			if (!result.success) {
				response.status(result.status).json({ error: result.error });
				return;
			}
			response.locals.playerActor = result.actor;
			next();
		} catch (error: unknown) {
			logger.error("HTTP", "Player guild membership validation failed", {
				method: request.method,
				error: error instanceof Error ? error.message : String(error),
			});
			response.status(500).json({ error: playerAccessValidationFailed });
		}
	},
	{ 401: "Authentication required", 403: playerGuildMemberRequired, 500: playerAccessValidationFailed },
);
