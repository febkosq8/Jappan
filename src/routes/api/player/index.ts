import type { QueueRepeatMode } from "discord-player";
import { z } from "zod";
import {
	playerSessionIdPattern,
	requirePlayerGuildMember,
	requirePlayerInVoiceChannel,
	requirePlayerSession,
} from "../../../handlers/playerSession.js";
import { requireActiveUser, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema, type RouteDefinition } from "../../../helpers/route.js";

import {
	addTracksToQueue,
	clearQueue,
	pausePlayer,
	playPreviousTrack,
	removeQueuedTrack,
	resumePlayer,
	seekTrack,
	setRepeat,
	setSessionLocked,
	setShuffle,
	setVolume,
	skipToQueuedTrack,
	skipTrack,
	stopPlayer,
} from "../../../helpers/playerActions.js";
import { getPlayerSessionState } from "../../../helpers/playerSessionState.js";
import { getPlayerSuggestions, MAX_PLAY_QUERY_LENGTH } from "../../../services/playerSearch.js";

const tags = ["Player"];
const security = [{ sessionCookie: [] }];
// Authenticate before resolving the session so unauthenticated callers cannot probe session IDs
const middleware = [
	requireDatabase,
	requireDiscord,
	requireSession,
	requireActiveUser,
	requirePlayerSession,
	requirePlayerGuildMember,
	requirePlayerInVoiceChannel,
];
// Viewing, locking and unlocking only need guild membership; the shared action enforces ownership and the lock
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

const commonResponses = {
	401: { description: "Authentication required", schema: errorResponseSchema },
	403: {
		description: "Not a member of this player's server or not in its voice channel",
		schema: errorResponseSchema,
	},
	400: { description: "Invalid session ID or request body", schema: errorResponseSchema },
	404: { description: "Player session not found or has ended", schema: errorResponseSchema },
	423: { description: "The session is locked by its owner", schema: errorResponseSchema },
	409: { description: "Action is not possible in the current player state", schema: errorResponseSchema },
	422: { description: "Action argument is out of range", schema: errorResponseSchema },
	503: { description: "Player or Discord is unavailable", schema: errorResponseSchema },
} as const;

const shuffleBody = z.object({ enabled: z.boolean().optional() }).strict();
const repeatBody = z
	.object({ mode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() })
	.strict();
const volumeBody = z.object({ volume: z.number().int().min(0).max(100) }).strict();
const seekBody = z.object({ positionMs: z.number().int().nonnegative() }).strict();
const indexBody = z.object({ index: z.number().int().nonnegative() }).strict();
const addTracksBody = z.object({ query: z.string().trim().min(1).max(MAX_PLAY_QUERY_LENGTH) }).strict();
const suggestionsQuery = z.object({ q: z.string().max(MAX_PLAY_QUERY_LENGTH).optional() });
const suggestionsSchema = z.object({
	suggestions: z.array(
		z.object({
			kind: z.enum(["track", "playlist", "savedPlaylist"]),
			title: z.string(),
			value: z.string(),
		}),
	),
});

const controlErrorResponses = {
	...commonResponses,
	500: { description: "Failed to control the player", schema: errorResponseSchema },
};
const playerRoutes: RouteDefinition[] = [
	{
		method: "get",
		path: "/:sessionId",
		tags,
		summary: "View a player session and its queue",
		errorMessage: "Failed to get player session",
		security,
		parameters,
		responses: {
			200: { description: "Player session state with the full queue", schema: playerSessionSchema },
			400: commonResponses[400],
			401: commonResponses[401],
			403: {
				description: "Not a member of this player's server",
				schema: errorResponseSchema,
			},
			404: commonResponses[404],
			503: commonResponses[503],
			500: { description: "Failed to get player session", schema: errorResponseSchema },
		},
		middleware: guildMemberMiddleware,
		handler: (_request, response) =>
			response.status(200).json(getPlayerSessionState(response.locals.playerQueue, response.locals.playerActor)),
	},
	{
		method: "get",
		path: "/:sessionId/suggestions",
		tags,
		summary: "Suggest tracks and playlists to add to the queue",
		errorMessage: "Failed to get queue suggestions",
		security,
		parameters: [
			...parameters,
			{
				name: "q",
				in: "query",
				description:
					"Text typed so far, a link, or a saved playlist name. Empty returns the user's saved playlists.",
				schema: z.string().max(MAX_PLAY_QUERY_LENGTH),
			},
		],
		responses: {
			200: {
				description:
					"Saved playlists of the signed-in user that match, then live search results, the same suggestions as the /play command",
				schema: suggestionsSchema,
			},
			...controlErrorResponses,
		},
		middleware,
		handler: async (request, response) => {
			const query = suggestionsQuery.safeParse(request.query);
			if (!query.success) {
				return response.status(400).json({ error: "Invalid query" });
			}
			const suggestions = await getPlayerSuggestions({
				query: query.data.q ?? "",
				userId: response.locals.playerActor.userId,
			});
			return response.status(200).json({ suggestions });
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/pause",
		tags,
		summary: "Pause playback",
		errorMessage: "Failed to pause playback",
		security,
		parameters,
		responses: {
			204: { description: "Playback was paused" },
			...controlErrorResponses,
		},
		middleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = pausePlayer({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/resume",
		tags,
		summary: "Resume playback",
		errorMessage: "Failed to resume playback",
		security,
		parameters,
		responses: {
			204: { description: "Playback was resumed" },
			...controlErrorResponses,
		},
		middleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = resumePlayer({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/next",
		tags,
		summary: "Skip to the next track",
		errorMessage: "Failed to skip to the next track",
		security,
		parameters,
		responses: {
			204: { description: "Skipped the current track and moved on to the next one in the queue" },
			...controlErrorResponses,
		},
		middleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = skipTrack({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/previous",
		tags,
		summary: "Return to the previous track",
		errorMessage: "Failed to return to the previous track",
		security,
		parameters,
		responses: {
			204: { description: "Returned to the previously played track" },
			...controlErrorResponses,
		},
		middleware,
		handler: async (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = await playPreviousTrack({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/stop",
		tags,
		summary: "Stop playback and end the session",
		errorMessage: "Failed to stop playback and end the session",
		security,
		parameters,
		responses: {
			204: { description: "Playback was stopped and the player session ended" },
			...controlErrorResponses,
		},
		middleware,
		handler: async (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = await stopPlayer({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/shuffle",
		tags,
		summary: "Set or toggle shuffle",
		errorMessage: "Failed to set or toggle shuffle",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: shuffleBody } } },
		responses: {
			204: { description: "Shuffle was turned on or off (toggled when enabled is omitted)" },
			...controlErrorResponses,
		},
		middleware,
		handler: (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = shuffleBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = setShuffle({ queue, actor, enabled: body.data.enabled });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/repeat",
		tags,
		summary: "Set or cycle the repeat mode",
		errorMessage: "Failed to set or cycle the repeat mode",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: repeatBody } } },
		responses: {
			204: {
				description: "Repeat mode was set to the requested mode, or advanced to the next mode when omitted",
			},
			...controlErrorResponses,
		},
		middleware,
		handler: (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = repeatBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = setRepeat({
				queue,
				actor,
				mode: body.data.mode as QueueRepeatMode | undefined,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/volume",
		tags,
		summary: "Set the volume",
		errorMessage: "Failed to set the volume",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: volumeBody } } },
		responses: {
			204: { description: "Volume was set to the requested percentage" },
			...controlErrorResponses,
		},
		middleware,
		handler: (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = volumeBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = setVolume({ queue, actor, volume: body.data.volume });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/seek",
		tags,
		summary: "Seek within the current track",
		errorMessage: "Failed to seek within the current track",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: seekBody } } },
		responses: {
			204: { description: "Playback moved to the requested position in the current track" },
			...controlErrorResponses,
		},
		middleware,
		handler: async (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = seekBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = await seekTrack({
				queue,
				actor,
				positionMs: body.data.positionMs,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/queue/remove",
		tags,
		summary: "Remove a track from the queue",
		errorMessage: "Failed to remove a track from the queue",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: indexBody } } },
		responses: {
			204: { description: "The track at the given queue index was removed" },
			...controlErrorResponses,
		},
		middleware,
		handler: (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = indexBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = removeQueuedTrack({
				queue,
				actor,
				index: body.data.index,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/queue/skip-to",
		tags,
		summary: "Skip to a track in the queue",
		errorMessage: "Failed to skip to a track in the queue",
		security,
		parameters,
		requestBody: { required: false, content: { "application/json": { schema: indexBody } } },
		responses: {
			204: { description: "Skipped to the track at the given queue index, which now starts playing" },
			...controlErrorResponses,
		},
		middleware,
		handler: (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = indexBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = skipToQueuedTrack({
				queue,
				actor,
				index: body.data.index,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/queue/clear",
		tags,
		summary: "Clear the queue",
		errorMessage: "Failed to clear the queue",
		security,
		parameters,
		responses: {
			204: {
				description: "Every upcoming track was removed from the queue while the current track keeps playing",
			},
			...controlErrorResponses,
		},
		middleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = clearQueue({ queue, actor });
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/queue/add",
		tags,
		summary: "Add tracks to the queue",
		errorMessage: "Failed to add tracks to the queue",
		security,
		parameters,
		requestBody: { required: true, content: { "application/json": { schema: addTracksBody } } },
		responses: {
			204: {
				description:
					"The matching track, or every track of the matching playlist, was added to the end of the queue",
			},
			...controlErrorResponses,
			422: { description: "Nothing was found for that query", schema: errorResponseSchema },
			503: { description: "The music player is unavailable", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const body = addTracksBody.safeParse(request.body ?? {});
			if (!body.success) {
				return response.status(400).json({ error: "Invalid request body" });
			}
			const result = await addTracksToQueue({
				queue,
				actor,
				query: body.data.query,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/lock",
		tags,
		summary: "Lock the session",
		errorMessage: "Failed to lock the session",
		security,
		parameters,
		responses: {
			204: {
				description: "The session was locked; only the owner and admins can change it until it is unlocked",
			},
			...controlErrorResponses,
			403: {
				description: "Not a member of this player's server, or not the session owner",
				schema: errorResponseSchema,
			},
		},
		middleware: guildMemberMiddleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = setSessionLocked({
				queue,
				actor,
				locked: true,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
	{
		method: "post",
		path: "/:sessionId/controls/unlock",
		tags,
		summary: "Unlock the session",
		errorMessage: "Failed to unlock the session",
		security,
		parameters,
		responses: {
			204: { description: "The session was unlocked; everyone in the voice channel can change it again" },
			...controlErrorResponses,
			403: {
				description: "Not a member of this player's server, or not the session owner",
				schema: errorResponseSchema,
			},
		},
		middleware: guildMemberMiddleware,
		handler: (_request, response) => {
			const { playerQueue: queue, playerActor: actor } = response.locals;
			const result = setSessionLocked({
				queue,
				actor,
				locked: false,
			});
			if (!result.success) {
				return response.status(result.status).json({ error: result.error });
			}
			return response.status(204).end();
		},
	},
];

export default defineRouter("/player", playerRoutes);
