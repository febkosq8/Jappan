import type { QueueRepeatMode, Track } from "discord-player";
import { canControlPlayerSession, isPlayerSessionOwner, type PlayerActor } from "../services/playerAccess.js";
import type { PlayerChangeSource, PlayerQueue } from "./player.js";

export const REPEAT_MODE_LABELS = ["off", "track", "queue", "autoplay"] as const;
export type PlayerRepeatModeLabel = (typeof REPEAT_MODE_LABELS)[number];

export interface PlayerSessionTrack {
	readonly id: string;
	readonly title: string;
	readonly author: string;
	readonly url: string | null;
	readonly thumbnailUrl: string | null;
	readonly source: string;
	readonly duration: string;
	readonly durationMs: number;
	readonly requestedBy: string | null;
}

export interface PlayerSessionState {
	readonly sessionId: string;
	readonly guild: { readonly name: string; readonly iconUrl: string | null };
	readonly channel: { readonly name: string; readonly listenerCount: number } | null;
	readonly owner: { readonly username: string; readonly avatarUrl: string | null };
	readonly locked: boolean;
	readonly lastChangedBy: {
		readonly username: string;
		readonly avatarUrl: string | null;
		readonly source: PlayerChangeSource;
		readonly timestampMs: number;
	} | null;
	/** What the requesting user may do with this session. */
	readonly viewer: {
		readonly isOwner: boolean;
		readonly isAdmin: boolean;
		readonly inVoiceChannel: boolean;
		readonly canControl: boolean;
		readonly canToggleLock: boolean;
	};
	readonly playerState: "Playing" | "Paused" | "Idle";
	readonly volume: number;
	readonly shuffle: boolean;
	readonly repeatMode: { readonly value: QueueRepeatMode; readonly label: PlayerRepeatModeLabel };
	readonly nowPlaying: (PlayerSessionTrack & { readonly positionMs: number }) | null;
	readonly previousTrack: PlayerSessionTrack | null;
	readonly queue: {
		readonly size: number;
		readonly totalDurationMs: number;
		readonly tracks: readonly (PlayerSessionTrack & { readonly index: number })[];
	};
	readonly historySize: number;
	readonly capabilities: {
		readonly canPause: boolean;
		readonly canResume: boolean;
		readonly canSkip: boolean;
		readonly canPrevious: boolean;
		readonly canSeek: boolean;
		readonly canShuffle: boolean;
		readonly canClear: boolean;
	};
	readonly serverTimestampMs: number;
}

function toHttpUrl(value: string | undefined): string | null {
	return value && URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol) ? value : null;
}

function serializeTrack(track: Track): PlayerSessionTrack {
	return {
		id: track.id,
		title: track.title,
		author: track.author,
		url: toHttpUrl(track.url),
		thumbnailUrl: toHttpUrl(track.thumbnail),
		source: track.source,
		duration: track.duration,
		durationMs: track.durationMS ?? 0,
		requestedBy: track.requestedBy?.username ?? null,
	};
}

function getChannelInfo(queue: PlayerQueue): PlayerSessionState["channel"] {
	const channel = queue.channel;
	if (!channel) {
		return null;
	}
	const listenerCount = "members" in channel ? channel.members.filter((member) => !member.user.bot).size : 0;
	return { name: channel.name, listenerCount };
}

function getLastChangeInfo(queue: PlayerQueue): PlayerSessionState["lastChangedBy"] {
	const change = queue.metadata.lastChangedBy;
	if (!change) {
		return null;
	}
	const changer = change.userId ? queue.guild.client.users.cache.get(change.userId) : undefined;
	return {
		username: change.username,
		avatarUrl: changer?.displayAvatarURL() ?? null,
		source: change.source,
		timestampMs: change.timestampMs,
	};
}

function getCapabilities(queue: PlayerQueue): PlayerSessionState["capabilities"] {
	const currentTrack = queue.currentTrack;
	const paused = queue.node.isPaused();
	return {
		canPause: Boolean(currentTrack) && !paused,
		canResume: Boolean(currentTrack) && paused,
		canSkip: Boolean(currentTrack) && !paused,
		canPrevious: Boolean(queue.history.previousTrack) && !paused,
		canSeek: Boolean(currentTrack) && (currentTrack?.durationMS ?? 0) > 0,
		canShuffle: queue.tracks.size > 1,
		canClear: queue.tracks.size > 0,
	};
}

/** Everything the web player shows about a session, from the point of view of `viewer`. */
export function getPlayerSessionState(queue: PlayerQueue, viewer: PlayerActor): PlayerSessionState {
	const { owner } = queue.metadata;
	// Prefer the live Discord user (current name and avatar) over the username stored when the session started
	const ownerUser = queue.guild.client.users.cache.get(owner.id);
	const currentTrack = queue.currentTrack;
	const previousTrack = queue.history.previousTrack;
	const tracks = queue.tracks.toArray();
	const isOwner = isPlayerSessionOwner(queue, viewer);
	const repeatValue = queue.repeatMode as QueueRepeatMode;
	return {
		sessionId: queue.metadata.sessionId,
		guild: { name: queue.guild.name, iconUrl: queue.guild.iconURL() },
		channel: getChannelInfo(queue),
		owner: { username: ownerUser?.username ?? owner.username, avatarUrl: ownerUser?.displayAvatarURL() ?? null },
		locked: queue.metadata.locked,
		lastChangedBy: getLastChangeInfo(queue),
		viewer: {
			isOwner,
			isAdmin: viewer.isAdmin,
			inVoiceChannel: viewer.inVoiceChannel,
			canControl: canControlPlayerSession(queue, viewer),
			canToggleLock: isOwner || viewer.isAdmin,
		},
		playerState: !currentTrack ? "Idle" : queue.node.isPaused() ? "Paused" : "Playing",
		volume: queue.node.volume,
		shuffle: queue.isShuffling,
		repeatMode: { value: repeatValue, label: REPEAT_MODE_LABELS[repeatValue] ?? "off" },
		nowPlaying: currentTrack ? { ...serializeTrack(currentTrack), positionMs: queue.node.streamTime } : null,
		previousTrack: previousTrack ? serializeTrack(previousTrack) : null,
		queue: {
			size: tracks.length,
			totalDurationMs: tracks.reduce((total, track) => total + (track.durationMS ?? 0), 0),
			tracks: tracks.map((track, index) => ({ ...serializeTrack(track), index })),
		},
		historySize: queue.history.tracks.size,
		capabilities: getCapabilities(queue),
		serverTimestampMs: Date.now(),
	};
}
