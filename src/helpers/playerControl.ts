import type { QueueRepeatMode } from "discord-player";
import { z } from "zod";
import { MAX_PLAY_QUERY_LENGTH } from "./playerLimits.js";
import {
	addTracksToQueue,
	clearQueue,
	pausePlayer,
	playPreviousTrack,
	refuse,
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
	type PlayerActionContext,
	type PlayerActionResult,
} from "./playerActions.js";

const indexBody = z.strictObject({ index: z.number().int().nonnegative() });

/** Every change the web player can request. `path` names the action and `body` carries its arguments. */
export const playerControlSchema = z.discriminatedUnion("path", [
	z.strictObject({
		path: z.literal(["pause", "resume", "next", "previous", "stop", "queue/clear", "lock", "unlock"]),
	}),
	z.strictObject({
		path: z.literal("shuffle"),
		body: z.strictObject({ enabled: z.boolean().optional() }).optional(),
	}),
	z.strictObject({
		path: z.literal("repeat"),
		body: z
			.strictObject({ mode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() })
			.optional(),
	}),
	z.strictObject({
		path: z.literal("volume"),
		body: z.strictObject({ volume: z.number().int().min(0).max(100) }),
	}),
	z.strictObject({
		path: z.literal("seek"),
		body: z.strictObject({ positionMs: z.number().int().nonnegative() }),
	}),
	z.strictObject({ path: z.literal(["queue/remove", "queue/skip-to"]), body: indexBody }),
	z.strictObject({
		path: z.literal("queue/add"),
		body: z.strictObject({ query: z.string().trim().min(1).max(MAX_PLAY_QUERY_LENGTH) }),
	}),
]);

export type PlayerControl = z.infer<typeof playerControlSchema>;

/** Runs a validated control through the same shared actions the Discord buttons use. */
export async function runPlayerControl({
	queue,
	actor,
	control,
}: PlayerActionContext & { control: PlayerControl }): Promise<PlayerActionResult> {
	switch (control.path) {
		case "pause":
			return pausePlayer({ queue, actor });
		case "resume":
			return resumePlayer({ queue, actor });
		case "next":
			return skipTrack({ queue, actor });
		case "previous":
			return playPreviousTrack({ queue, actor });
		case "stop":
			return stopPlayer({ queue, actor });
		case "queue/clear":
			return clearQueue({ queue, actor });
		case "lock":
			return setSessionLocked({ queue, actor, locked: true });
		case "unlock":
			return setSessionLocked({ queue, actor, locked: false });
		case "shuffle":
			return setShuffle({ queue, actor, enabled: control.body?.enabled });
		case "repeat":
			return setRepeat({ queue, actor, mode: control.body?.mode as QueueRepeatMode | undefined });
		case "volume":
			return setVolume({ queue, actor, volume: control.body.volume });
		case "seek":
			return seekTrack({ queue, actor, positionMs: control.body.positionMs });
		case "queue/remove":
			return removeQueuedTrack({ queue, actor, index: control.body.index });
		case "queue/skip-to":
			return skipToQueuedTrack({ queue, actor, index: control.body.index });
		case "queue/add":
			return addTracksToQueue({ queue, actor, query: control.body.query });
		default:
			return refuse(422, "Unsupported player action");
	}
}
