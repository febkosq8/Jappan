import type { Track } from "discord-player";
import { getInnertube, getVideoId } from "discord-player-youtubei";

import { logger } from "../services/logger.js";

// Upcoming tracks enriched per event, so a huge playlist does not trigger hundreds of YouTube lookups at once
const MAX_TRACKS_PER_BATCH = 25;
const LOOKUP_CONCURRENCY = 5;

function formatTimeCode(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);
	const pad = (value: number) => value.toString().padStart(2, "0");
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function needsMetadata(track: Track): boolean {
	return track.source === "youtube" && Boolean(track.url) && (!track.duration || !track.author);
}

/**
 * YouTube search results can arrive as lockup views, which the extractor turns into tracks without a duration or
 * author. This fills both in from the video's own metadata; any failure leaves the track as it was.
 */
export async function enrichTrackMetadata(track: Track): Promise<void> {
	if (!needsMetadata(track)) {
		return;
	}
	try {
		const info = await (await getInnertube()).getBasicInfo(getVideoId(track.url) ?? "");
		const { duration, author, is_live: live } = info.basic_info;
		if (!track.duration && duration && !live) {
			track.duration = formatTimeCode(duration);
		}
		if (!track.author && author) {
			track.author = author;
		}
	} catch (error: unknown) {
		logger.debug("PLAYER", "Could not load track metadata", {
			track: track.title,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function enrichTracksMetadata(tracks: readonly Track[]): Promise<void> {
	const pending = tracks.filter(needsMetadata).slice(0, MAX_TRACKS_PER_BATCH);
	for (let start = 0; start < pending.length; start += LOOKUP_CONCURRENCY) {
		await Promise.all(pending.slice(start, start + LOOKUP_CONCURRENCY).map(enrichTrackMetadata));
	}
}
