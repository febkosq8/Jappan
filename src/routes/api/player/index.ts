import { z } from "zod";
import {
	playerSessionIdPattern,
	requirePlayerGuildMember,
	requirePlayerSession,
} from "../../../handlers/playerSession.js";
import { requireActiveUser, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema, type RouteDefinition } from "../../../helpers/route.js";
import { getPlayerSessionState } from "../../../helpers/playerSessionState.js";
const tags = ["Player"];
const security = [{ sessionCookie: [] }];
// Authenticate before resolving the session so unauthenticated callers cannot probe session IDs.
// Viewing only needs guild membership; changing the session happens over the WebSocket, which enforces the
// voice channel, ownership and the lock.
const guildMemberMiddleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireActiveUser,
	requirePlayerSession,
	requirePlayerGuildMember,
];
const parameters = [
	{
		name: "sessionId",
		in: "path",
		required: true,
		description: "Unguessable player session ID",
		schema: z.string().regex(playerSessionIdPattern),
	},
] as const;

const trackSchema = z.object({
	id: z.string(),
	title: z.string(),
	author: z.string(),
	url: z.string().nullable(),
	thumbnailUrl: z.string().nullable(),
	source: z.string(),
	durationMs: z.number().int().nonnegative(),
	requestedBy: z.object({ username: z.string(), avatarUrl: z.string().nullable() }).nullable(),
});
const playerSessionSchema = z.object({
	sessionId: z.string(),
	guild: z.object({ id: z.string(), name: z.string(), iconUrl: z.string().nullable() }),
	channel: z
		.object({
			id: z.string(),
			name: z.string(),
			listenerCount: z.number().int().nonnegative(),
			region: z.string().nullable(),
		})
		.nullable(),
	owner: z.object({ username: z.string(), avatarUrl: z.string().nullable() }),
	locked: z.boolean(),
	lastChangedBy: z
		.object({
			username: z.string(),
			avatarUrl: z.string().nullable(),
			source: z.enum(["discord", "web"]),
			timestampMs: z.number().int(),
		})
		.nullable(),
	viewer: z.object({
		isOwner: z.boolean(),
		isAdmin: z.boolean(),
		inVoiceChannel: z.boolean(),
		canControl: z.boolean(),
		canToggleLock: z.boolean(),
	}),
	playerState: z.enum(["Playing", "Paused", "Idle"]),
	volume: z.number(),
	shuffle: z.boolean(),
	repeatMode: z.object({
		value: z.number().int().min(0).max(3),
		label: z.enum(["off", "track", "queue", "autoplay"]),
	}),
	nowPlaying: trackSchema.extend({ positionMs: z.number().nonnegative() }).nullable(),
	previousTrack: trackSchema.nullable(),
	queue: z.object({
		size: z.number().int().nonnegative(),
		totalDurationMs: z.number().int().nonnegative(),
		tracks: z.array(trackSchema.extend({ index: z.number().int().nonnegative() })),
	}),
	historySize: z.number().int().nonnegative(),
	capabilities: z.object({
		canPause: z.boolean(),
		canResume: z.boolean(),
		canSkip: z.boolean(),
		canPrevious: z.boolean(),
		canSeek: z.boolean(),
		canShuffle: z.boolean(),
		canClear: z.boolean(),
	}),
	serverTimestampMs: z.number().int(),
});

const sessionResponses = {
	401: { description: "Authentication required", schema: errorResponseSchema },
	403: { description: "Not a member of this player's server", schema: errorResponseSchema },
	400: { description: "Invalid session ID", schema: errorResponseSchema },
	404: { description: "Player session not found or has ended", schema: errorResponseSchema },
	503: { description: "Player or Discord is unavailable", schema: errorResponseSchema },
} as const;
const playerRoutes: RouteDefinition[] = [
	{
		method: "get",
		path: "/:sessionId",
		tags,
		summary: "View a player session and its queue (live updates and controls use the WebSocket)",
		errorMessage: "Failed to get player session",
		security,
		parameters,
		responses: {
			200: { description: "Player session state with the full queue", schema: playerSessionSchema },
			...sessionResponses,
			500: { description: "Failed to get player session", schema: errorResponseSchema },
		},
		middleware: guildMemberMiddleware,
		handler: (_request, response) =>
			response.status(200).json(getPlayerSessionState(response.locals.playerQueue, response.locals.playerActor)),
	},
];
export default defineRouter("/player", playerRoutes);
