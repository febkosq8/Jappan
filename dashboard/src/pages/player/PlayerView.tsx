import { Avatar, Button, Card, PillLink, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import {
	FiPause,
	FiPlay,
	FiRepeat,
	FiLock,
	FiShuffle,
	FiSkipBack,
	FiSkipForward,
	FiSquare,
	FiTrash2,
	FiUnlock,
	FiVolume2,
} from "react-icons/fi";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import AddToQueue from "@jappan/components/player/AddToQueue";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, {
	type PlayerControlAction,
	type PlayerSession,
	type PlayerTrack,
} from "@jappan/handlers/APIHandler";

// How often the player state is refreshed, in milliseconds
const POLL_INTERVAL_MS = 5000;
const repeatLabels: Record<PlayerSession["repeatMode"]["label"], string> = {
	off: "Repeat off",
	track: "Repeat track",
	queue: "Repeat queue",
	autoplay: "Autoplay",
};

function formatDuration(milliseconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (value: number) => value.toString().padStart(2, "0");
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (axios.isAxiosError<{ error?: string }>(error)) {
		return error.response?.data?.error ?? fallback;
	}
	return fallback;
}

function TrackTitle({ track }: { track: PlayerTrack }) {
	// Plain anchor: the session ID is part of this page's URL, so never leak it through the Referer header.
	return track.url ? (
		<a
			href={track.url}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-primary underline-offset-2 hover:underline"
		>
			{track.title}
		</a>
	) : (
		<span className="font-medium">{track.title}</span>
	);
}

function Thumbnail({ track, className }: { track: PlayerTrack; className: string }) {
	return track.thumbnailUrl ? (
		<img
			src={track.thumbnailUrl}
			alt=""
			referrerPolicy="no-referrer"
			loading="lazy"
			className={`${className} shrink-0 rounded-md object-cover`}
		/>
	) : (
		<div className={`${className} shrink-0 rounded-md bg-muted`} aria-hidden="true" />
	);
}

function NowPlaying({
	session,
	busy,
	onControl,
	receivedAt,
}: {
	session: PlayerSession;
	busy: boolean;
	onControl: (action: PlayerControlAction) => void;
	receivedAt: number;
}) {
	const track = session.nowPlaying;
	const [now, setNow] = useState(() => Date.now());
	const [seekDraft, setSeekDraft] = useState<number | null>(null);
	const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
	useEffect(() => {
		if (session.playerState !== "Playing") {
			return;
		}
		const timer = window.setInterval(() => setNow(Date.now()), 500);
		return () => window.clearInterval(timer);
	}, [session.playerState]);

	if (!track) {
		return (
			<Card hoverable={false} className="rounded-md border-border">
				<Card.Content className="p-6! text-center text-muted-foreground">
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

	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="flex flex-col gap-5 p-4!">
				<div className="flex items-center gap-4">
					<Thumbnail track={track} className="size-24 sm:size-32" />
					<div className="min-w-0">
						<Tag variant={paused ? "warning" : "success"} size="sm">
							{session.playerState}
						</Tag>
						<h2 className="mt-2 text-xl font-semibold wrap-break-words">
							<TrackTitle track={track} />
						</h2>
						<p className="text-sm text-muted-foreground wrap-break-words">
							{track.author} · {track.source}
							{track.requestedBy ? ` · requested by ${track.requestedBy}` : ""}
						</p>
					</div>
				</div>

				<div>
					<input
						type="range"
						aria-label="Track position"
						min={0}
						max={Math.max(track.durationMs, 1)}
						step={1000}
						value={Math.min(position, Math.max(track.durationMs, 1))}
						disabled={!capabilities.canSeek || busy}
						onChange={(event) => setSeekDraft(Number(event.target.value))}
						onPointerUp={() => {
							if (seekDraft !== null) {
								onControl({ path: "seek", body: { positionMs: seekDraft } });
								setSeekDraft(null);
							}
						}}
						onKeyUp={() => {
							if (seekDraft !== null) {
								onControl({ path: "seek", body: { positionMs: seekDraft } });
								setSeekDraft(null);
							}
						}}
						className="w-full accent-primary"
					/>
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>{formatDuration(position)}</span>
						<span>{track.durationMs ? formatDuration(track.durationMs) : track.duration}</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button
						variant="secondary"
						aria-label="Previous track"
						title="Previous track"
						disabled={!capabilities.canPrevious || busy}
						onClick={() => onControl({ path: "previous" })}
					>
						<FiSkipBack aria-hidden="true" />
					</Button>
					<Button
						variant="primary"
						aria-label={paused ? "Resume" : "Pause"}
						title={paused ? "Resume" : "Pause"}
						disabled={!(capabilities.canPause || capabilities.canResume) || busy}
						onClick={() => onControl({ path: paused ? "resume" : "pause" })}
					>
						{paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
					</Button>
					<Button
						variant="secondary"
						aria-label="Next track"
						title="Next track"
						disabled={!capabilities.canSkip || busy}
						onClick={() => onControl({ path: "next" })}
					>
						<FiSkipForward aria-hidden="true" />
					</Button>
					<Button
						variant="destructive"
						aria-label="Stop playback"
						title="Stop playback"
						disabled={busy}
						onClick={() => {
							if (window.confirm("Stop playback and end this player session?")) {
								onControl({ path: "stop" });
							}
						}}
					>
						<FiSquare aria-hidden="true" />
					</Button>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button
						variant={session.shuffle ? "primary" : "outline-secondary"}
						size="sm"
						aria-pressed={session.shuffle}
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

function QueueList({
	session,
	busy,
	onControl,
}: {
	session: PlayerSession;
	busy: boolean;
	onControl: (action: PlayerControlAction) => void;
}) {
	const { tracks, size, totalDurationMs } = session.queue;
	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="p-4!">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-lg font-semibold">
						Up next{" "}
						<span className="text-sm font-normal text-muted-foreground">
							{size} {size === 1 ? "track" : "tracks"}
							{totalDurationMs ? ` · ${formatDuration(totalDurationMs)}` : ""}
						</span>
					</h2>
					<Button
						variant="outline-destructive"
						size="sm"
						disabled={!session.capabilities.canClear || busy}
						onClick={() => {
							if (window.confirm("Remove every track from the queue?")) {
								onControl({ path: "queue/clear" });
							}
						}}
					>
						<FiTrash2 className="mr-1" aria-hidden="true" />
						Clear queue
					</Button>
				</div>
				{tracks.length === 0 ? (
					<p className="mt-4 text-sm text-muted-foreground">No tracks are waiting in the queue.</p>
				) : (
					<ol className="mt-4 flex flex-col divide-y divide-border">
						{tracks.map((track) => (
							<li key={`${track.id}-${track.index}`} className="flex items-center gap-3 py-2">
								<span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
									{track.index + 1}
								</span>
								<Thumbnail track={track} className="size-10" />
								<div className="min-w-0 flex-1 text-sm">
									<div className="truncate">
										<TrackTitle track={track} />
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{track.author}
										{track.requestedBy ? ` · ${track.requestedBy}` : ""}
									</div>
								</div>
								<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
									{track.durationMs ? formatDuration(track.durationMs) : track.duration}
								</span>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Skip to ${track.title}, removing the tracks above it`}
									title="Skip to this track (removes the tracks above it)"
									disabled={busy || !session.capabilities.canSkip}
									onClick={() => onControl({ path: "queue/skip-to", body: { index: track.index } })}
								>
									<FiPlay aria-hidden="true" />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove ${track.title} from the queue`}
									title="Remove from queue"
									disabled={busy}
									onClick={() => onControl({ path: "queue/remove", body: { index: track.index } })}
								>
									<FiTrash2 aria-hidden="true" />
								</Button>
							</li>
						))}
					</ol>
				)}
			</Card.Content>
		</Card>
	);
}

export default function PlayerView() {
	const { sessionId = "" } = useParams();
	const queryClient = useQueryClient();
	const queryKey = ["player-session", sessionId];
	const [ended, setEnded] = useState(false);

	const sessionQuery = useQuery({
		queryKey,
		queryFn: () => APIHandler.getPlayerSession(sessionId),
		enabled: sessionId !== "" && !ended,
		refetchInterval: (query) => (query.state.error ? false : POLL_INTERVAL_MS),
	});

	const controlMutation = useMutation<void, unknown, PlayerControlAction>({
		mutationFn: (action) => APIHandler.controlPlayerSession(sessionId, action),
		onSuccess: (_result, action) => {
			if (action.path === "stop") {
				setEnded(true);
				queryClient.removeQueries({ queryKey });
				toast.success("Playback stopped.");
				return;
			}
			if (action.path === "queue/add") {
				toast.success("Added to the queue.");
			}
			// Returned so the controls stay disabled until the refreshed state arrives
			return queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			if (accessErrorStatus(error)) {
				void queryClient.invalidateQueries({ queryKey: ["session"] });
			}
			toast.error(getErrorMessage(error, "The player action failed."));
			void queryClient.invalidateQueries({ queryKey });
		},
	});

	const status = axios.isAxiosError(sessionQuery.error) ? sessionQuery.error.response?.status : undefined;
	const accessStatus = accessErrorStatus(sessionQuery.error);
	if (accessStatus === 401) {
		return <AccessRedirect status={401} />;
	}
	if (accessStatus === 403) {
		return (
			<main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 text-center">
				<h1 className="text-2xl font-bold">You can't view this player</h1>
				<p className="mt-2 max-w-md text-muted-foreground">
					{getErrorMessage(sessionQuery.error, "You don't have access to this player.")} Join the server in
					Discord, then try again.
				</p>
				<Button className="mt-6" onClick={() => void sessionQuery.refetch()}>
					Try again
				</Button>
			</main>
		);
	}

	if (ended || status === 404 || status === 400) {
		return (
			<main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 text-center">
				<h1 className="text-3xl font-bold">Player session ended</h1>
				<p className="mt-2 max-w-md text-muted-foreground">
					This session is no longer active or the link is invalid. Start playback again in Discord to get a
					new session.
				</p>
				<PillLink variant="primary" href="/" className="mt-6">
					Back home
				</PillLink>
			</main>
		);
	}

	const session = sessionQuery.data;
	if (!session) {
		return sessionQuery.isError ? (
			<main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 text-center">
				<h1 className="text-2xl font-bold">Player unavailable</h1>
				<p className="mt-2 text-muted-foreground">
					{getErrorMessage(sessionQuery.error, "Could not reach the player.")}
				</p>
				<Button className="mt-6" onClick={() => void sessionQuery.refetch()}>
					Try again
				</Button>
			</main>
		) : (
			<LoadingIndicator label="Loading player session" />
		);
	}

	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<Avatar name={session.guild.name} image={session.guild.iconUrl} size="sm" aria-hidden="true" />
					<div className="min-w-0">
						<h1 className="typography-heading-2 truncate text-2xl font-bold tracking-tight">
							{session.guild.name}
						</h1>
						<p className="text-sm text-muted-foreground">
							{session.channel
								? `${session.channel.name} · ${session.channel.listenerCount} listening`
								: "Not connected"}
							{` · owner ${session.owner.username}`}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{session.locked && (
						<Tag variant="warning" size="sm">
							<FiLock className="mr-1 size-3.5" aria-hidden="true" />
							Locked
						</Tag>
					)}
					{session.viewer.canToggleLock && (
						<Button
							variant="outline-secondary"
							size="sm"
							disabled={controlMutation.isPending}
							onClick={() => controlMutation.mutate({ path: session.locked ? "unlock" : "lock" })}
						>
							{session.locked ? (
								<FiUnlock className="mr-1" aria-hidden="true" />
							) : (
								<FiLock className="mr-1" aria-hidden="true" />
							)}
							{session.locked ? "Unlock session" : "Lock session"}
						</Button>
					)}
				</div>
			</div>
			{session.lastChangedBy && (
				<p className="mb-4 text-sm text-muted-foreground">
					Last change by <span className="font-medium text-foreground">{session.lastChangedBy.username}</span>{" "}
					via {session.lastChangedBy.source === "web" ? "Web Player" : "Discord"} at{" "}
					{new Date(session.lastChangedBy.timestampMs).toLocaleTimeString()}
				</p>
			)}
			{!session.viewer.inVoiceChannel && (
				<p role="status" className="mb-4 rounded-md border border-border p-3 text-sm">
					Join the player's voice channel in Discord to control playback. You can still view the queue
					{session.viewer.canToggleLock ? " and lock or unlock the session" : ""}.
				</p>
			)}
			{session.locked && session.viewer.inVoiceChannel && !session.viewer.canControl && (
				<p role="status" className="mb-4 rounded-md border border-warning p-3 text-sm">
					<FiLock className="mr-1 inline size-4" aria-hidden="true" />
					The session owner locked this player. You can watch the queue, but only the owner can change it.
				</p>
			)}
			{sessionQuery.isError && (
				<p role="status" className="mb-4 text-sm text-warning">
					Could not refresh the player. Showing the last loaded data.
				</p>
			)}
			<div className="flex flex-col gap-4">
				<NowPlaying
					session={session}
					busy={controlMutation.isPending || !session.viewer.canControl}
					onControl={(action) => controlMutation.mutate(action)}
					receivedAt={sessionQuery.dataUpdatedAt}
				/>
				{session.viewer.canControl && (
					<AddToQueue
						sessionId={sessionId}
						disabled={controlMutation.isPending}
						adding={controlMutation.isPending && controlMutation.variables?.path === "queue/add"}
						onAdd={(query) => controlMutation.mutate({ path: "queue/add", body: { query } })}
					/>
				)}
				<QueueList
					session={session}
					busy={controlMutation.isPending || !session.viewer.canControl}
					onControl={(action) => controlMutation.mutate(action)}
				/>
			</div>
		</main>
	);
}
