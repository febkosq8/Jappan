import { z } from "zod";

import { getLinkedDiscordAccountId, requireActiveUser, requireSession } from "../../../handlers/auth.js";
import { requireDatabase } from "../../../handlers/availability.js";
import {
	filterListByQuery,
	listQueryParameters,
	listQuerySchema,
	paginateList,
	paginatedListSchema,
	parseListQuery,
} from "../../../helpers/list.js";
import { isValidPlaylistQuery } from "../../../helpers/playlist.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import type { AuthSession } from "../../../services/auth.js";
import { searchPlayer } from "../../../services/player.js";
import { listUserPlaylists, removeUserPlaylist, saveUserPlaylist } from "../../../services/userPlaylist.js";

const tags = ["Playlist"];
const security = [{ sessionBearer: [] }];
const middleware = [requireDatabase, requireSession, requireActiveUser];
const playlistSchema = z.object({
	listname: z.string(),
	query: z.string(),
	shuffle: z.boolean(),
	loop: z.boolean(),
});
const savePlaylistSchema = z.strictObject({
	listname: z.string().trim().min(1, "Playlist names must be between 1 and 100 characters.").max(100),
	query: z
		.string()
		.trim()
		.min(1, "Enter a search query, track URL, or playlist URL.")
		.max(2000)
		.refine(isValidPlaylistQuery, "Enter a valid HTTP(S) track/playlist URL or a search query."),
	shuffle: z.boolean(),
	loop: z.boolean(),
});
const removePlaylistSchema = z.strictObject({ listname: z.string().trim().min(1).max(100) });

export default defineRouter("/playlists", [
	{
		method: "get",
		path: "/",
		tags,
		summary: "List the signed-in user's saved playlists",
		errorMessage: "Failed to list saved playlists",
		security,
		parameters: listQueryParameters,
		responses: {
			200: { description: "The user's saved playlists", schema: paginatedListSchema(playlistSchema) },
			400: { description: "Invalid list query", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			503: { description: "Database unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list saved playlists", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const session: AuthSession = response.locals.authSession;
			const userId = await getLinkedDiscordAccountId(session, response);
			if (!userId) return;
			const playlists = await listUserPlaylists(userId);
			const filtered = filterListByQuery({
				items: playlists,
				query: query.query,
				fieldFilters: query.fieldFilters,
				itemSchema: playlistSchema,
				response,
			});
			if (!filtered) return;
			return response
				.status(200)
				.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
		},
	},
	{
		method: "put",
		path: "/",
		tags,
		summary: "Save or update a playlist for the signed-in user",
		errorMessage: "Failed to save playlist",
		security,
		requestBody: {
			required: true,
			content: { "application/json": { schema: savePlaylistSchema } },
		},
		responses: {
			204: { description: "Playlist saved or updated" },
			400: { description: "Invalid playlist details", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			422: { description: "No tracks found for the query", schema: errorResponseSchema },
			503: { description: "Database unavailable", schema: errorResponseSchema },
			500: { description: "Failed to save playlist", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const session: AuthSession = response.locals.authSession;
			const userId = await getLinkedDiscordAccountId(session, response);
			if (!userId) return;
			const parsed = savePlaylistSchema.safeParse(request.body);
			if (!parsed.success) {
				return response
					.status(400)
					.json({ error: parsed.error.issues[0]?.message ?? "Invalid playlist details" });
			}
			const { listname, query, shuffle, loop } = parsed.data;
			const searchResponse = await searchPlayer(query, { requestedBy: userId });
			if (!searchResponse.success || !searchResponse.data.hasTracks()) {
				return response.status(422).json({ error: `No tracks found for '${query}'.` });
			}
			const entry = { listname, query, shuffle, loop };
			await saveUserPlaylist({
				userId,
				username: session.user.username ?? session.user.name,
				entry,
			});
			return response.status(204).end();
		},
	},
	{
		method: "delete",
		path: "/",
		tags,
		summary: "Remove a saved playlist from the signed-in user's account",
		errorMessage: "Failed to remove playlist",
		security,
		requestBody: {
			required: true,
			content: { "application/json": { schema: removePlaylistSchema } },
		},
		responses: {
			204: { description: "Playlist removed" },
			400: { description: "Invalid playlist name", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Active account and linked Discord account required", schema: errorResponseSchema },
			404: { description: "Saved playlist not found", schema: errorResponseSchema },
			503: { description: "Database unavailable", schema: errorResponseSchema },
			500: { description: "Failed to remove playlist", schema: errorResponseSchema },
		},
		middleware,
		handler: async (request, response) => {
			const session: AuthSession = response.locals.authSession;
			const userId = await getLinkedDiscordAccountId(session, response);
			if (!userId) return;
			const parsed = removePlaylistSchema.safeParse(request.body);
			if (!parsed.success) {
				return response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid playlist name" });
			}
			const removed = await removeUserPlaylist({ userId, listname: parsed.data.listname });
			if (!removed) {
				return response.status(404).json({ error: `No saved playlist matched **${parsed.data.listname}**.` });
			}
			return response.status(204).end();
		},
	},
]);
