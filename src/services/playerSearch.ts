import { Internal } from "@discord-player/extractor";
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

function getSpotifyPlaylistId(query: string): string | undefined {
	const uriMatch = /^spotify:playlist:([A-Za-z0-9]+)$/u.exec(query);
	if (uriMatch?.[1]) {
		return uriMatch[1];
	}
	try {
		const url = new URL(query);
		if (url.hostname !== "open.spotify.com") {
			return undefined;
		}
		const segments = url.pathname.split("/").filter(Boolean);
		const playlistIndex = segments.indexOf("playlist");
		const playlistId = segments[playlistIndex + 1];
		return playlistIndex >= 0 && playlistId && /^[A-Za-z0-9]+$/u.test(playlistId) ? playlistId : undefined;
	} catch {
		return undefined;
	}
}

function getSpotifyApiErrorMessage(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object" || !("error" in payload)) {
		return undefined;
	}
	const error = payload.error;
	if (typeof error === "string") {
		return error;
	}
	return error && typeof error === "object" && "message" in error && typeof error.message === "string"
		? error.message
		: undefined;
}

function getSpotifyPlaylistTrackCount(payload: unknown): number | undefined {
	if (!payload || typeof payload !== "object" || !("tracks" in payload)) {
		return undefined;
	}
	const tracks = payload.tracks;
	if (!tracks || typeof tracks !== "object" || !("items" in tracks) || !Array.isArray(tracks.items)) {
		return undefined;
	}
	return tracks.items.length;
}

async function diagnoseSpotifyPlaylistFailure(query: string): Promise<void> {
	const playlistId = getSpotifyPlaylistId(query);
	if (!playlistId) {
		return;
	}
	const clientId = process.env.DP_SPOTIFY_CLIENT_ID || null;
	const clientSecret = process.env.DP_SPOTIFY_CLIENT_SECRET || null;
	const clientCredentialsConfigured = Boolean(clientId && clientSecret);
	const spotifyApi = new Internal.SpotifyAPI({ clientId, clientSecret });
	try {
		const token = await spotifyApi.requestToken();
		if (!token) {
			logger.warn("PLAYER", "Spotify playlist lookup returned no tracks; no Spotify API token is available", {
				playlistId,
				clientCredentialsConfigured,
			});
			return;
		}
		const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?market=US`, {
			headers: { Authorization: `${token.type} ${token.token}` },
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			logger.warn("PLAYER", "Spotify playlist API rejected a playlist that the extractor could not resolve", {
				playlistId,
				httpStatus: response.status,
				apiMessage: getSpotifyApiErrorMessage(payload),
				clientCredentialsConfigured,
			});
			return;
		}
		logger.warn("PLAYER", "Spotify extractor returned no tracks for a playlist that the Spotify API resolved", {
			playlistId,
			httpStatus: response.status,
			apiTrackCount: getSpotifyPlaylistTrackCount(payload),
			clientCredentialsConfigured,
		});
	} catch (error: unknown) {
		logger.warn("PLAYER", "Spotify playlist API diagnostic request failed", {
			playlistId,
			clientCredentialsConfigured,
			error: error instanceof Error ? error.message : String(error),
		});
	}
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
	const savedSuggestions = savedPlaylists.map(toSavedPlaylistSuggestion);
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
	if (!searchResponse.data.hasTracks()) {
		void diagnoseSpotifyPlaylistFailure(playerQuery);
	}
	return { success: true, searchResult: searchResponse.data, savedPlaylist };
}
