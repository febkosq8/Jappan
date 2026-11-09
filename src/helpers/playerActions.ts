import type { QueueRepeatMode, SearchResult } from "discord-player";
import type { PlaylistEntry } from "../models/userPlaylist.js";
import { logger } from "../services/logger.js";
import {
	canControlPlayerSession,
	isPlayerSessionOwner,
	recordPlayerChange,
	type PlayerActor,
} from "../services/playerAccess.js";
import { notifyPlayerChanged } from "../services/playerWebsocket.js";
import { resolvePlayerQuery } from "../services/playerSearch.js";
import { formatGuild, formatUser } from "./discord.js";
import {
	getNextRepeatMode,
	closeDisconnectedQueue,
	isQueueDisconnected,
	markPlayerStatusMessageStopped,
	shuffleQueueIfEnabled,
	updatePlayerQueueMessage,
	type PlayerQueue,
} from "./player.js";

/** Which session to change and who is changing it. Every player action takes this plus whatever the action needs. */
export interface PlayerActionContext {
	queue: PlayerQueue;
	actor: PlayerActor;
}

export type PlayerActionResult =
	| {
			readonly success: true;
			/** Something the user should know about a change that still worked. */ readonly notice?:
				string | undefined;
	  }
	| { readonly success: false; readonly status: 403 | 409 | 422 | 423 | 503; readonly error: string };

const succeeded: PlayerActionResult = { success: true };

export function refuse(status: 403 | 409 | 422 | 423 | 503, error: string): PlayerActionResult {
	return { success: false, status, error };
}

/** A session can only be changed while it exists, from its voice channel, and unless locked by someone else. */
function getChangeRefusal({ queue, actor }: PlayerActionContext): PlayerActionResult | undefined {
	if (queue.deleted) {
		return refuse(409, "This session has ended");
	}
	// The bot left voice but the queue is still around; end it so every viewer is told
	if (isQueueDisconnected(queue)) {
		closeDisconnectedQueue(queue);
		return refuse(409, "This session has ended");
	}
	if (!actor.inVoiceChannel) {
		return refuse(403, "You must be in this player's voice channel to change it");
	}
	return canControlPlayerSession(queue, actor) ? undefined : refuse(423, "This session is locked by its owner");
}

function refuseWhenNothingPlaying({ queue }: { queue: PlayerQueue }): PlayerActionResult | undefined {
	return queue.currentTrack ? undefined : refuse(409, "Nothing is playing");
}

/** Ending the current track does not work while the player is paused, so track changes need playback resumed. */
function refuseWhenPaused({ queue }: { queue: PlayerQueue }): PlayerActionResult | undefined {
	return queue.node.isPaused() ? refuse(409, "Resume playback before changing tracks") : undefined;
}

function logPlayerAction({ queue, actor, action }: PlayerActionContext & { action: string }): void {
	logger.info("PLAYER", "Player action applied", {
		guild: formatGuild(queue.guild),
		action,
		source: actor.source,
		user: formatUser(actor),
	});
}

/** Ends a successful change: remembers who made it, refreshes the Discord player message and the web players. */
function completeChange({ queue, actor, action }: PlayerActionContext & { action: string }): PlayerActionResult {
	logPlayerAction({ queue, actor, action });
	recordPlayerChange(queue, actor);
	void updatePlayerQueueMessage({ queue, content: "" });
	notifyPlayerChanged(queue);
	return succeeded;
}

export function pausePlayer({ queue, actor }: PlayerActionContext): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor }) ?? refuseWhenNothingPlaying({ queue });
	if (refusal) {
		return refusal;
	}
	queue.node.setPaused(true);
	return completeChange({ queue, actor, action: "pause" });
}

export function resumePlayer({ queue, actor }: PlayerActionContext): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor }) ?? refuseWhenNothingPlaying({ queue });
	if (refusal) {
		return refusal;
	}
	queue.node.setPaused(false);
	return completeChange({ queue, actor, action: "resume" });
}

export function skipTrack({ queue, actor }: PlayerActionContext): PlayerActionResult {
	const refusal =
		getChangeRefusal({ queue, actor }) ?? refuseWhenNothingPlaying({ queue }) ?? refuseWhenPaused({ queue });
	if (refusal) {
		return refusal;
	}
	queue.node.skip();
	return completeChange({ queue, actor, action: "skip" });
}

export async function playPreviousTrack({ queue, actor }: PlayerActionContext): Promise<PlayerActionResult> {
	const refusal = getChangeRefusal({ queue, actor }) ?? refuseWhenPaused({ queue });
	if (refusal) {
		return refusal;
	}
	if (!queue.history.previousTrack) {
		return refuse(409, "There is no previous track");
	}
	await queue.history.previous();
	return completeChange({ queue, actor, action: "previous" });
}

/**
 * Turns shuffle on or off; toggles it when `enabled` is omitted. Turning it on reorders the queue right away and
 * keeps mixing in tracks added later. Turning it off cannot restore the old order, it only stops the mixing.
 */
export function setShuffle({
	queue,
	actor,
	enabled,
}: PlayerActionContext & { enabled?: boolean | undefined }): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	// discord-player's dynamic shuffle picks a random track when one ends and leaves the list in its old order,
	// so the list would not match what plays. It stays off.
	queue.disableShuffle();
	queue.metadata.shuffle = enabled ?? !queue.metadata.shuffle;
	shuffleQueueIfEnabled(queue);
	return completeChange({ queue, actor, action: "shuffle" });
}
/** Sets the repeat mode; advances to the next mode when `mode` is omitted. */
export function setRepeat({
	queue,
	actor,
	mode,
}: PlayerActionContext & { mode?: QueueRepeatMode | undefined }): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	queue.setRepeatMode(mode ?? getNextRepeatMode(queue.repeatMode as QueueRepeatMode));
	return completeChange({ queue, actor, action: "repeat" });
}

export function setVolume({ queue, actor, volume }: PlayerActionContext & { volume: number }): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	queue.node.setVolume(volume);
	return completeChange({ queue, actor, action: "volume" });
}

export async function seekTrack({
	queue,
	actor,
	positionMs,
}: PlayerActionContext & { positionMs: number }): Promise<PlayerActionResult> {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	const durationMs = queue.currentTrack?.durationMS;
	if (!durationMs) {
		return refuse(409, "The current track cannot be seeked");
	}
	if (positionMs >= durationMs) {
		return refuse(422, "Position is beyond the end of the track");
	}
	const seeked = await queue.node.seek(positionMs);
	if (!seeked) {
		return refuse(409, "Could not seek to that position");
	}
	return completeChange({ queue, actor, action: "seek" });
}

export function removeQueuedTrack({
	queue,
	actor,
	index,
}: PlayerActionContext & { index: number }): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	if (index >= queue.tracks.size) {
		return refuse(422, "Queue index is out of range");
	}
	queue.removeTrack(index);
	return completeChange({ queue, actor, action: "removeTrack" });
}

export function skipToQueuedTrack({
	queue,
	actor,
	index,
}: PlayerActionContext & { index: number }): PlayerActionResult {
	// skipTo drops the tracks before the target before it skips, so refuse first rather than lose them for nothing
	const refusal =
		getChangeRefusal({ queue, actor }) ?? refuseWhenNothingPlaying({ queue }) ?? refuseWhenPaused({ queue });
	if (refusal) {
		return refusal;
	}
	if (index >= queue.tracks.size) {
		return refuse(422, "Queue index is out of range");
	}
	queue.node.skipTo(index);
	return completeChange({ queue, actor, action: "skipTo" });
}

export function clearQueue({ queue, actor }: PlayerActionContext): PlayerActionResult {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	queue.tracks.clear();
	return completeChange({ queue, actor, action: "clearQueue" });
}

/**
 * Adds already-resolved search results to the end of the queue and starts playback if the queue was idle. The queue
 * is changed under its task lock, the same way discord-player's own `play()` does, so this cannot race with a
 * `/play` that is starting playback.
 */
export async function addResolvedTracksToQueue({
	queue,
	actor,
	searchResult,
	savedPlaylist,
}: PlayerActionContext & {
	searchResult: SearchResult;
	savedPlaylist: PlaylistEntry | undefined;
}): Promise<PlayerActionResult> {
	await queue.tasksQueue.acquire().getTask();
	try {
		// The session may have ended, been locked or lost its voice connection while searching or waiting for the lock
		const refusal = getChangeRefusal({ queue, actor });
		if (refusal) {
			return refusal;
		}
		if (!queue.channel) {
			return refuse(409, "The bot is not connected to a voice channel");
		}
		const room = queue.getCapacity();
		if (room === 0) {
			return refuse(422, `The queue is full (${queue.maxSize} tracks)`);
		}
		// Like /play: a playlist adds all its tracks (shuffled for a shuffling saved playlist), anything else only the
		// first result. As many as fit in the queue are added.
		const candidates = !searchResult.playlist
			? searchResult.tracks.slice(0, 1)
			: savedPlaylist?.shuffle
				? [...searchResult.tracks].sort(() => Math.random() - 0.5)
				: searchResult.tracks;
		const tracks = candidates.slice(0, room);
		queue.addTrack(tracks);
		shuffleQueueIfEnabled(queue);
		if (!queue.isPlaying()) {
			await queue.node.play(null);
		}
		const result = completeChange({ queue, actor, action: "addTracks" });
		return tracks.length < candidates.length
			? {
					success: true,
					notice: `Added ${tracks.length} of ${candidates.length} tracks. The queue is limited to ${queue.maxSize}.`,
				}
			: result;
	} finally {
		queue.tasksQueue.release();
	}
}

/**
 * Adds what a play query resolves to (a track, a playlist or a saved playlist) to the queue. Access is checked
 * before the search so a refused user does not trigger one; the search itself runs outside the queue's task lock
 * because it is slow.
 */
export async function addTracksToQueue({
	queue,
	actor,
	query,
}: PlayerActionContext & { query: string }): Promise<PlayerActionResult> {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	const resolvedQuery = await resolvePlayerQuery({ query, userId: actor.id });
	if (!resolvedQuery.success) {
		return refuse(503, "The music player is unavailable");
	}
	const { searchResult, savedPlaylist } = resolvedQuery;
	if (!searchResult.hasTracks()) {
		return refuse(422, "Nothing was found for that query");
	}
	return addResolvedTracksToQueue({ queue, actor, searchResult, savedPlaylist });
}

/** Ends the session. `queue.delete()` only emits "queueDelete", so the Discord status message is updated here. */
export async function stopPlayer({ queue, actor }: PlayerActionContext): Promise<PlayerActionResult> {
	const refusal = getChangeRefusal({ queue, actor });
	if (refusal) {
		return refusal;
	}
	const { statusMessage, owner } = queue.metadata;
	queue.delete();
	if (statusMessage) {
		await markPlayerStatusMessageStopped({ message: statusMessage, owner });
	}
	logPlayerAction({ queue, actor, action: "stop" });
	return succeeded;
}

/** Locks or unlocks the session; only the owner and bot admins may do so, and it is not a change to the queue. */
export function setSessionLocked({
	queue,
	actor,
	locked,
}: PlayerActionContext & { locked: boolean }): PlayerActionResult {
	if (queue.deleted) {
		return refuse(409, "This session has ended");
	}
	if (!actor.isAdmin && !isPlayerSessionOwner(queue, actor)) {
		return refuse(403, "Only the session owner can lock or unlock this session");
	}
	queue.metadata.locked = locked;
	logPlayerAction({ queue, actor, action: locked ? "lock" : "unlock" });
	void updatePlayerQueueMessage({ queue, content: "" });
	notifyPlayerChanged(queue);
	return succeeded;
}
