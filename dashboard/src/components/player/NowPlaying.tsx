import { Button, Card, DoubleClickButton, Tag } from "@febkosq8/arc";
import { useEffect, useState } from "react";
import {
	FiCheck,
	FiPause,
	FiPlay,
	FiRepeat,
	FiShuffle,
	FiSkipBack,
	FiSkipForward,
	FiSquare,
	FiVolume2,
} from "react-icons/fi";
import formatDuration from "@jappan/helpers/formatDuration";
import RefreshIndicator from "@jappan/components/player/RefreshIndicator";
import TrackThumbnail from "@jappan/components/player/TrackThumbnail";
import TrackTitle from "@jappan/components/player/TrackTitle";
import type { PlayerControlAction, PlayerSession } from "@jappan/handlers/APIHandler";
import { CONFIRM_CLICK_MS } from "@jappan/helpers/confirmClick";

const repeatLabels: Record<PlayerSession["repeatMode"]["label"], string> = {
	off: "Repeat off",
	track: "Repeat track",
	queue: "Repeat queue",
	autoplay: "Autoplay",
};

export default function NowPlaying({
	session,
	busy,
	refreshing,
	onControl,
	receivedAt,
	live,
}: {
	session: PlayerSession;
	busy: boolean;
	refreshing: boolean;
	onControl: (action: PlayerControlAction) => void;
	receivedAt: number;
	/** False when the player cannot be reached at all; the position then stops instead of guessing. */
	live: boolean;
}) {
	const track = session.nowPlaying;
	const [now, setNow] = useState(() => Date.now());
	const [seekDraft, setSeekDraft] = useState<number | null>(null);
	// receivedAt when the seek was sent; the draft is kept until fresher state arrives so the slider doesn't snap back
	const [seekSentAt, setSeekSentAt] = useState<number | null>(null);
	useEffect(() => {
		if (seekSentAt !== null && receivedAt !== seekSentAt) {
			setSeekDraft(null);
			setSeekSentAt(null);
		}
	}, [receivedAt, seekSentAt]);
	const commitSeek = () => {
		if (seekDraft !== null && seekSentAt === null) {
			setSeekSentAt(receivedAt);
			onControl({ path: "seek", body: { positionMs: seekDraft } });
		}
	};
	const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
	useEffect(() => {
		// Without the clock ticking, `now` stays where it was, so the bar stops where it is instead of jumping back
		if (session.playerState !== "Playing" || !live) {
			return;
		}
		const timer = window.setInterval(() => setNow(Date.now()), 500);
		return () => window.clearInterval(timer);
	}, [session.playerState, live]);

	if (!track) {
		return (
			<Card hoverable={false} className="rounded-md border-border">
				<Card.Content className="relative p-6! text-center text-muted-foreground">
					<RefreshIndicator active={refreshing} className="absolute right-4 top-4" />
					<h2 className="mb-2 text-sm font-semibold">Now playing</h2>
					Nothing is playing right now.
				</Card.Content>
			</Card>
		);
	}

	const elapsedSinceFetch = session.playerState === "Playing" ? Math.max(0, now - receivedAt) : 0;
	const livePosition = Math.min(track.positionMs + elapsedSinceFetch, track.durationMs || Number.MAX_SAFE_INTEGER);
	const position = seekDraft ?? livePosition;
	const volume = volumeDraft ?? session.volume;
	const { capabilities } = session;
	const paused = session.playerState === "Paused";
	const hasDuration = track.durationMs > 0;

	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="flex flex-col gap-5 p-4!">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-base font-semibold text-muted-foreground">Now playing</h2>
					<div className="flex items-center gap-2">
						<RefreshIndicator active={refreshing} />
						{track.source && (
							<Tag variant="secondary" size="xs" className="capitalize">
								Source: {track.source}
							</Tag>
						)}
					</div>
				</div>
				<div className="flex items-center gap-4">
					<TrackThumbnail track={track} className="size-24 sm:size-32" />
					<div className="min-w-0 flex-1">
						<Tag variant={paused ? "warning" : "success"} size="sm">
							{session.playerState}
						</Tag>
						<h2 className="mt-2 text-xl leading-tight font-semibold wrap-break-word">
							<TrackTitle track={track} />
						</h2>
						{track.author && (
							<p className="mt-1 text-base text-muted-foreground wrap-break-word">{track.author}</p>
						)}
					</div>
				</div>

				<div>
					{hasDuration ? (
						<input
							type="range"
							aria-label="Track position"
							min={0}
							max={track.durationMs}
							step={1000}
							value={Math.min(position, track.durationMs)}
							disabled={!capabilities.canSeek || busy}
							onChange={(event) => setSeekDraft(Number(event.target.value))}
							onPointerUp={commitSeek}
							onKeyUp={commitSeek}
							className="w-full accent-primary"
						/>
					) : (
						<div
							role="progressbar"
							aria-label="Track position (length unknown)"
							className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
						>
							<div
								className={`h-full w-1/3 rounded-full bg-primary ${paused ? "" : "animate-pulse"}`}
								style={{ marginLeft: `${((position / 1000) % 20) * 3.35}%` }}
							/>
						</div>
					)}
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>{formatDuration(position)}</span>
						<span>{hasDuration ? formatDuration(track.durationMs) : "Length unknown"}</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button
						variant="secondary"
						size="icon-md"
						aria-label="Previous track"
						title="Previous track"
						disabled={!capabilities.canPrevious || busy}
						onClick={() => onControl({ path: "previous" })}
					>
						<FiSkipBack aria-hidden="true" />
					</Button>
					<Button
						variant="primary"
						size="icon-md"
						aria-label={paused ? "Resume" : "Pause"}
						title={paused ? "Resume" : "Pause"}
						disabled={!(capabilities.canPause || capabilities.canResume) || busy}
						onClick={() => onControl({ path: paused ? "resume" : "pause" })}
					>
						{paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
					</Button>
					<Button
						variant="secondary"
						size="icon-md"
						aria-label="Next track"
						title="Next track"
						disabled={!capabilities.canSkip || busy}
						onClick={() => onControl({ path: "next" })}
					>
						<FiSkipForward aria-hidden="true" />
					</Button>
					<DoubleClickButton
						doubleClickMsDuration={CONFIRM_CLICK_MS}
						variant="destructive"
						size="icon-md"
						aria-label="Stop playback"
						title="Stop playback and end this session (click twice)"
						disabled={busy}
						feedbackVariant="destructive"
						feedbackContent={<FiCheck aria-hidden="true" />}
						onDoubleClick={() => onControl({ path: "stop" })}
					>
						<FiSquare aria-hidden="true" />
					</DoubleClickButton>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button
						variant={session.shuffle ? "primary" : "outline-secondary"}
						size="sm"
						aria-pressed={session.shuffle}
						title={
							session.shuffle
								? "Stop mixing in new tracks. The queue keeps its current order."
								: "Shuffle the queue now and mix in tracks added later."
						}
						disabled={!capabilities.canShuffle || busy}
						onClick={() => onControl({ path: "shuffle", body: { enabled: !session.shuffle } })}
					>
						<FiShuffle className="mr-1" aria-hidden="true" />
						Shuffle {session.shuffle ? "on" : "off"}
					</Button>
					<Button
						variant={session.repeatMode.value === 0 ? "outline-secondary" : "primary"}
						size="sm"
						disabled={busy}
						onClick={() =>
							onControl({
								path: "repeat",
								body: { mode: ((session.repeatMode.value + 1) % 4) as 0 | 1 | 2 | 3 },
							})
						}
					>
						<FiRepeat className="mr-1" aria-hidden="true" />
						{repeatLabels[session.repeatMode.label]}
					</Button>
					<label className="flex items-center gap-2 text-sm">
						<FiVolume2 aria-hidden="true" />
						<span className="sr-only">Volume</span>
						<input
							type="range"
							aria-label="Volume"
							min={0}
							max={100}
							step={1}
							value={volume}
							disabled={busy}
							onChange={(event) => setVolumeDraft(Number(event.target.value))}
							onPointerUp={() => {
								if (volumeDraft !== null) {
									onControl({ path: "volume", body: { volume: volumeDraft } });
									setVolumeDraft(null);
								}
							}}
							onKeyUp={() => {
								if (volumeDraft !== null) {
									onControl({ path: "volume", body: { volume: volumeDraft } });
									setVolumeDraft(null);
								}
							}}
							className="w-32 accent-primary"
						/>
						<span className="w-10 tabular-nums text-muted-foreground">{volume}%</span>
					</label>
				</div>
			</Card.Content>
		</Card>
	);
}
