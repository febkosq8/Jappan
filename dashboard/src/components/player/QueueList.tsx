import { Avatar, Button, Card, DoubleClickButton } from "@febkosq8/arc";
import { FiPlay, FiTrash2 } from "react-icons/fi";
import formatDuration from "@jappan/helpers/formatDuration";
import RefreshIndicator from "@jappan/components/player/RefreshIndicator";
import TrackThumbnail from "@jappan/components/player/TrackThumbnail";
import TrackTitle from "@jappan/components/player/TrackTitle";
import type { PlayerControlAction, PlayerSession } from "@jappan/handlers/APIHandler";
import { CONFIRM_CLICK_MS } from "@jappan/helpers/confirmClick";

export default function QueueList({
	session,
	busy,
	refreshing,
	onControl,
}: {
	session: PlayerSession;
	busy: boolean;
	refreshing: boolean;
	onControl: (action: PlayerControlAction) => void;
}) {
	const { tracks, size, totalDurationMs } = session.queue;
	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="p-4!">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						Up next
						<RefreshIndicator active={refreshing} />{" "}
						<span className="text-sm font-normal text-muted-foreground">
							{size} {size === 1 ? "track" : "tracks"}
							{totalDurationMs ? ` · ${formatDuration(totalDurationMs)}` : ""}
						</span>
					</h2>
					<DoubleClickButton
						doubleClickMsDuration={CONFIRM_CLICK_MS}
						variant="outline-destructive"
						size="sm"
						disabled={!session.capabilities.canClear || busy}
						feedbackVariant="destructive"
						feedbackContent="Click again to clear"
						onDoubleClick={() => onControl({ path: "queue/clear" })}
					>
						<span className="inline-flex items-center">
							<FiTrash2 className="mr-1" aria-hidden="true" />
							Clear queue
						</span>
					</DoubleClickButton>
				</div>
				{tracks.length === 0 ? (
					<p className="mt-4 text-sm text-muted-foreground">No tracks are waiting in the queue.</p>
				) : (
					<ol className="mt-4 flex max-h-[60dvh] flex-col divide-y divide-border overflow-y-auto pr-1">
						{tracks.map((track) => (
							<li key={`${track.id}-${track.index}`} className="flex items-center gap-3 py-2">
								<span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
									{track.index + 1}
								</span>
								<TrackThumbnail track={track} className="size-10" />
								<div className="min-w-0 flex-1 text-sm">
									<div className="truncate">
										<TrackTitle track={track} />
									</div>
									<div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
										<span className="truncate">{track.author}</span>
										{track.requestedBy && (
											<span className="flex shrink-0 items-center gap-1.5">
												<Avatar
													name={track.requestedBy.username}
													image={track.requestedBy.avatarUrl}
													size="sm"
													className="size-5"
													aria-hidden="true"
												/>
												<span className="max-w-32 truncate">{track.requestedBy.username}</span>
											</span>
										)}
									</div>
								</div>
								<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
									{track.durationMs ? formatDuration(track.durationMs) : "--:--"}
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
