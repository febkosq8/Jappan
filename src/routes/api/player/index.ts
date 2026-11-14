import { z } from "zod";
import {
	playerSessionIdPattern,
	requirePlayerGuildMember,
	requirePlayerSession,
} from "../../../handlers/playerSession.js";
import { getLinkedDiscordAccountId, requireActiveUser, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema, type RouteDefinition } from "../../../helpers/route.js";
import { MAX_PLAY_QUERY_LENGTH } from "../../../helpers/playerLimits.js";
import { getPlayerSessionState } from "../../../helpers/playerSessionState.js";
import type { AuthSession } from "../../../services/auth.js";
import { getPlayerWebUser } from "../../../services/playerAccess.js";
import { getPlayerSuggestions } from "../../../services/playerSearch.js";
import { startPlayerSession } from "../../../services/playerSessionStart.js";
import { getPlayerSessionViewerCount } from "../../../services/playerWebsocket.js";
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
	webPlayerCount: z.number().int().nonnegative(),
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
const startPlayerSessionSchema = z.strictObject({
	guildId: z.string().regex(/^\d{17,20}$/u),
	query: z.string().trim().min(1).max(MAX_PLAY_QUERY_LENGTH),
});
const playerSuggestionsSchema = z.strictObject({
	query: z.string().trim().max(MAX_PLAY_QUERY_LENGTH),
});
const playerSuggestionSchema = z.object({
	kind: z.enum(["track", "playlist", "savedPlaylist"]),
	title: z.string(),
	value: z.string(),
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
		method: "post",
		path: "/suggestions",
		tags,
		summary: "Suggest tracks, playlists, and saved playlists for the signed-in user",
		errorMessage: "Failed to get player suggestions",
		security,
		requestBody: {
			required: true,
			content: { "application/json": { schema: playerSuggestionsSchema } },
		},
		responses: {
			200: { description: "Matching player suggestions", schema: z.array(playerSuggestionSchema) },
			400: { description: "Invalid search query", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			503: { description: "Database or Discord is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get player suggestions", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireActiveUser],
		handler: async (request, response) => {
			const body = playerSuggestionsSchema.safeParse(request.body);
			if (!body.success) {
				return response.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid search query" });
			}
			const session: AuthSession = response.locals.authSession;
			const userId = await getLinkedDiscordAccountId(session, response);
			if (!userId) return;
			return response.status(200).json(await getPlayerSuggestions({ query: body.data.query, userId }));
		},
	},
	{
		method: "post",
		path: "/start",
		tags,
		summary: "Start or add playback from the dashboard",
		errorMessage: "Failed to start player session",
		security,
		requestBody: {
			required: true,
			content: { "application/json": { schema: startPlayerSessionSchema } },
		},
		responses: {
			200: {
				description: "Playback started or added to an active session",
				schema: z.object({ sessionId: z.string(), skippedTracks: z.number().int().nonnegative() }),
			},
			400: { description: "Invalid server or query", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Server membership or voice permissions required", schema: errorResponseSchema },
			404: { description: "Jappan is not available in the server", schema: errorResponseSchema },
			409: { description: "Voice channel unavailable or conflicting session", schema: errorResponseSchema },
			422: { description: "No tracks found or queue is full", schema: errorResponseSchema },
			423: { description: "Player session is locked", schema: errorResponseSchema },
			503: { description: "Player, Discord, or server is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to start player session", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireActiveUser],
		handler: async (request, response) => {
			const body = startPlayerSessionSchema.safeParse(request.body);
			if (!body.success) {
				return response
					.status(400)
					.json({ error: body.error.issues[0]?.message ?? "Invalid playback request" });
			}
			const session: AuthSession = response.locals.authSession;
			const user = await getPlayerWebUser(session);
			const result = await startPlayerSession({ ...body.data, user });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(200).json({
				sessionId: result.sessionId,
				skippedTracks: result.skippedTracks,
			});
		},
	},
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
			response.status(200).json(
				getPlayerSessionState({
					queue: response.locals.playerQueue,
					viewer: response.locals.playerActor,
					webPlayerCount: getPlayerSessionViewerCount(response.locals.playerQueue.metadata.sessionId),
				}),
			),
	},
];
export default defineRouter("/player", playerRoutes);
