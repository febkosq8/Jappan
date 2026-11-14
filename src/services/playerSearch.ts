import type { SearchResult } from "discord-player";
import type { PlaylistEntry } from "../models/userPlaylist.js";
import { MAX_PLAY_QUERY_LENGTH } from "../helpers/playerLimits.js";
import { isDatabaseConnected } from "./database.js";
import { logger } from "./logger.js";
import { searchPlayer, type PlayerErrorCode } from "./player.js";
import { findUserPlaylist, listUserPlaylists } from "./userPlaylist.js";

const MAX_SUGGESTIONS = 25;
const MAX_TRACK_SUGGESTIONS = 6;

export type PlayerSuggestionKind = "track" | "playlist" | "savedPlaylist";

/** One autocomplete entry; `value` is what to send back as the query when the entry is picked. */
export interface PlayerSuggestion {
	readonly kind: PlayerSuggestionKind;
	readonly title: string;
	readonly value: string;
}

export type ResolvedPlayerQuery =
	| { readonly success: true; readonly searchResult: SearchResult; readonly savedPlaylist: PlaylistEntry | undefined }
	| { readonly success: false; readonly error_code: PlayerErrorCode };

function toSavedPlaylistSuggestion(playlist: PlaylistEntry): PlayerSuggestion {
	return { kind: "savedPlaylist", title: playlist.listname, value: playlist.listname };
}

/**
 * Autocomplete for a play query: the user's saved playlists plus live search results. Used by the
 * `/play` autocomplete and the web player so both suggest the same things.
 */
export async function getPlayerSuggestions({
	query,
	userId,
}: {
	query: string;
	userId: string | null;
}): Promise<PlayerSuggestion[]> {
	const trimmedQuery = query.trim();
	const savedPlaylists =
		userId && isDatabaseConnected() ? await listUserPlaylists(userId).catch(() => [] as PlaylistEntry[]) : [];
	const savedSuggestions = savedPlaylists
		.map(toSavedPlaylistSuggestion)
		.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
	if (!trimmedQuery) {
		return savedSuggestions.slice(0, MAX_SUGGESTIONS);
	}
	const exactSavedPlaylist = savedPlaylists.find(
		(playlist) => playlist.listname.toLowerCase() === trimmedQuery.toLowerCase(),
	);
	if (exactSavedPlaylist) {
		return [toSavedPlaylistSuggestion(exactSavedPlaylist)];
	}
	try {
		const searchResponse = await searchPlayer(trimmedQuery, userId ? { requestedBy: userId } : {});
		const matchingSavedSuggestions = savedSuggestions.filter((suggestion) =>
			suggestion.title.toLowerCase().includes(trimmedQuery.toLowerCase()),
		);
		const result = searchResponse.success ? searchResponse.data : undefined;
		const searchSuggestions: PlayerSuggestion[] = result?.playlist
			? [{ kind: "playlist", title: result.playlist.title, value: trimmedQuery }]
			: (result?.tracks
					.slice(0, MAX_TRACK_SUGGESTIONS)
					.map((track): PlayerSuggestion => ({ kind: "track", title: track.title, value: track.url })) ?? []);
		return [...matchingSavedSuggestions, ...searchSuggestions].slice(0, MAX_SUGGESTIONS);
	} catch {
		return [];
	}
}

/**
 * Turns a play query into search results. A query that exactly matches one of the user's saved playlists
 * resolves to that playlist's stored query. Used by `/play` and the web player's add-to-queue.
 */
export async function resolvePlayerQuery({
	query,
	userId,
}: {
	query: string;
	userId: string | null;
}): Promise<ResolvedPlayerQuery> {
	let savedPlaylist: PlaylistEntry | undefined;
	if (userId && isDatabaseConnected()) {
		try {
			savedPlaylist = await findUserPlaylist(userId, query);
		} catch (error: unknown) {
			logger.warn("PLAYER", "Failed to look up saved playlist; using live search", { error, query });
		}
	}
	const playerQuery = savedPlaylist?.query ?? query;
	const searchResponse = await searchPlayer(playerQuery, userId ? { requestedBy: userId } : {});
	if (!searchResponse.success) {
		return { success: false, error_code: searchResponse.error_code };
	}
	return { success: true, searchResult: searchResponse.data, savedPlaylist };
}
