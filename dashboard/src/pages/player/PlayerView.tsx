import { Avatar, Button, Card, DateHandler, PillLink, Tabs, TabsList, TabsPanel, TabsTab, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiArrowLeft, FiInfo, FiLock, FiUnlock, FiVolume2 } from "react-icons/fi";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import AddToQueue from "@jappan/components/player/AddToQueue";
import NowPlaying from "@jappan/components/player/NowPlaying";
import PlayerLoading from "@jappan/components/player/PlayerLoading";
import getErrorMessage from "@jappan/helpers/getErrorMessage";
import { playerSections, readSectionFromHash } from "@jappan/helpers/playerSections";
import QueueList from "@jappan/components/player/QueueList";
import RefreshIndicator from "@jappan/components/player/RefreshIndicator";
import APIHandler, { type PlayerControlAction } from "@jappan/handlers/APIHandler";

// How often the player state is refreshed, in milliseconds
const POLL_INTERVAL_MS = 5000;

const CONTROL_TOAST_MESSAGES: Record<PlayerControlAction["path"], { loading: string; success: string }> = {
	pause: { loading: "Pausing…", success: "Playback paused." },
	resume: { loading: "Resuming…", success: "Playback resumed." },
	next: { loading: "Skipping…", success: "Skipped to the next track." },
	previous: { loading: "Going back…", success: "Playing the previous track." },
	stop: { loading: "Stopping…", success: "Playback stopped." },
	"queue/clear": { loading: "Clearing the queue…", success: "Queue cleared." },
	lock: { loading: "Locking…", success: "Player locked." },
	unlock: { loading: "Unlocking…", success: "Player unlocked." },
	shuffle: { loading: "Updating shuffle…", success: "Shuffle updated." },
	repeat: { loading: "Updating repeat…", success: "Repeat updated." },
	volume: { loading: "Changing volume…", success: "Volume changed." },
	seek: { loading: "Seeking…", success: "Seeked to the new position." },
	"queue/remove": { loading: "Removing track…", success: "Track removed." },
	"queue/skip-to": { loading: "Skipping to track…", success: "Skipped to the selected track." },
	"queue/add": { loading: "Adding to the queue…", success: "Added to the queue." },
};

export default function PlayerView() {
	const { sessionId = "" } = useParams();
	const queryClient = useQueryClient();
	const queryKey = ["player-session", sessionId];
	const [ended, setEnded] = useState(false);
	const [section, setSection] = useState(readSectionFromHash);

	useEffect(() => {
		const handleHashChange = () => setSection(readSectionFromHash());
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const changeSection = (value: string) => {
		setSection(value);
		window.history.replaceState(
			window.history.state,
			"",
			`${window.location.pathname}${window.location.search}#${value}`,
		);
	};

	const sessionQuery = useQuery({
		queryKey,
		queryFn: () => APIHandler.getPlayerSession(sessionId),
		enabled: sessionId !== "" && !ended,
		refetchInterval: (query) => (query.state.error ? false : POLL_INTERVAL_MS),
	});

	const controlMutation = useMutation<void, unknown, PlayerControlAction>({
		mutationFn: (action) => {
			const request = APIHandler.controlPlayerSession(sessionId, action);
			const messages = CONTROL_TOAST_MESSAGES[action.path];
			toast.promise(request, {
				loading: messages.loading,
				success: messages.success,
				error: (error: unknown) => getErrorMessage(error, "The player action failed."),
			});
			return request;
		},
		onSuccess: (_result, action) => {
			if (action.path === "stop") {
				setEnded(true);
				queryClient.removeQueries({ queryKey });
				return;
			}
			// Returned so the controls stay disabled until the refreshed state arrives
			return queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			if (accessErrorStatus(error)) {
				void queryClient.invalidateQueries({ queryKey: ["session"] });
			}
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
				<h1 className="text-3xl font-bold">No session found</h1>
				<p className="mt-2 max-w-md text-muted-foreground">This can happen for a few reasons:</p>
				<ul className="mt-3 max-w-md list-disc space-y-1 pl-5 text-left text-muted-foreground">
					<li>The session ended because playback stopped or the bot left the voice channel.</li>
					<li>The link is invalid or incomplete.</li>
					<li>The bot restarted, which clears active sessions.</li>
				</ul>
				<p className="mt-3 max-w-md text-muted-foreground">
					Start playback again in Discord to get a new session.
				</p>
				<PillLink variant="outline-secondary" href="/" className="mt-6 gap-2">
					<FiArrowLeft aria-hidden="true" />
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
			<PlayerLoading section={section} onSectionChange={changeSection} />
		);
	}

	const refreshing = controlMutation.isPending || sessionQuery.isFetching;
	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
			<div className="mb-4 grid gap-4 sm:grid-cols-2">
				<Card hoverable={false} className="rounded-md border-border">
					<Card.Content className="relative flex items-center justify-start gap-4 p-4!">
						<RefreshIndicator active={refreshing} className="absolute right-4 top-4" />
						<Avatar
							name={session.guild.name}
							image={session.guild.iconUrl}
							size="xl"
							className="size-16 text-2xl"
							aria-hidden="true"
						/>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-muted-foreground">Server</p>
							<h1 className="truncate text-xl font-bold tracking-tight">{session.guild.name}</h1>
						</div>
					</Card.Content>
				</Card>
				<Card hoverable={false} className="rounded-md border-border">
					<Card.Content className="relative flex h-full flex-col justify-center p-4!">
						<RefreshIndicator active={refreshing} className="absolute right-4 top-4" />
						<p className="text-sm font-semibold text-muted-foreground">Voice channel</p>
						<h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
							<FiVolume2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
							<span className="truncate">{session.channel ? session.channel.name : "Not connected"}</span>
						</h2>
						{session.channel && (
							<p className="text-sm text-muted-foreground">{session.channel.listenerCount} listening</p>
						)}
					</Card.Content>
				</Card>
				<Card hoverable={false} className="rounded-md border-border sm:col-span-2">
					<Card.Content className="relative flex flex-col gap-3 p-4!">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="text-sm font-semibold text-muted-foreground">Session</p>
							<div className="flex items-center gap-2">
								<RefreshIndicator active={refreshing} />
								{session.viewer.canToggleLock && (
									<Button
										variant="outline-secondary"
										size="sm"
										disabled={controlMutation.isPending}
										onClick={() =>
											controlMutation.mutate({ path: session.locked ? "unlock" : "lock" })
										}
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
						<div className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
							<div className="min-w-0">
								<p className="text-sm font-semibold text-muted-foreground">Owner</p>
								<div className="flex min-w-0 items-center gap-2">
									<Avatar
										name={session.owner.username}
										image={session.owner.avatarUrl}
										size="md"
										className="size-10 shrink-0"
										aria-hidden="true"
									/>
									<p className="truncate text-sm font-medium text-foreground">
										{session.owner.username}
									</p>
								</div>
							</div>
							<div className="min-w-0">
								<p className="text-sm font-semibold text-muted-foreground">Last change</p>
								{session.lastChangedBy ? (
									<div className="flex min-w-0 items-center gap-2">
										<Avatar
											name={session.lastChangedBy.username}
											image={session.lastChangedBy.avatarUrl}
											size="md"
											className="size-10 shrink-0"
											aria-hidden="true"
										/>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-foreground">
												{session.lastChangedBy.username}
											</p>
											<p className="text-xs text-muted-foreground">
												via {session.lastChangedBy.source === "web" ? "Web Player" : "Discord"}{" "}
												at {DateHandler.getDateTime(session.lastChangedBy.timestampMs)} (
												{DateHandler.getRelativeTime(session.lastChangedBy.timestampMs)})
											</p>
										</div>
									</div>
								) : (
									<p className="text-sm text-muted-foreground">No changes yet</p>
								)}
							</div>
							<div className="min-w-0">
								<p className="text-sm font-semibold text-muted-foreground">Access</p>
								<div className="flex h-10 items-center">
									<Tag variant={session.locked ? "warning" : "success"} size="xs">
										{session.locked ? (
											<FiLock className="mr-1 size-3" aria-hidden="true" />
										) : (
											<FiUnlock className="mr-1 size-3" aria-hidden="true" />
										)}
										{session.locked ? "Locked" : "Unlocked"}
									</Tag>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card>
			</div>
			{!session.viewer.inVoiceChannel && (
				<Card hoverable={false} className="mb-4 rounded-md border-border">
					<Card.Content role="status" className="flex items-center justify-start gap-3 p-4! text-left text-sm">
						<FiInfo className="size-5 shrink-0 text-primary" aria-hidden="true" />
						<span>
							Join the player's voice channel in Discord to control playback.
							<br />
							You can still view the queue
							{session.viewer.canToggleLock ? " and lock or unlock the session" : ""}.
						</span>
					</Card.Content>
				</Card>
			)}
			{session.locked && session.viewer.inVoiceChannel && !session.viewer.canControl && (
				<Card hoverable={false} className="mb-4 rounded-md border-warning">
					<Card.Content role="status" className="flex items-center justify-start gap-3 p-4! text-left text-sm">
						<FiLock className="size-5 shrink-0 text-warning" aria-hidden="true" />
						<span>
							The session owner locked this player.
							<br />
							You can watch the queue, but only the owner can change it.
						</span>
					</Card.Content>
				</Card>
			)}
			{sessionQuery.isError && (
				<Card hoverable={false} className="mb-4 rounded-md border-warning">
					<Card.Content role="status" className="flex items-center justify-start gap-3 p-4! text-left text-sm text-warning">
						<FiAlertTriangle className="size-5 shrink-0" aria-hidden="true" />
						<span>Could not refresh the player. Showing the last loaded data.</span>
					</Card.Content>
				</Card>
			)}
			<Tabs value={section} onValueChange={changeSection} className="gap-5">
				<TabsList aria-label="Player sections">
					{playerSections.map(({ id, label }) => (
						<TabsTab key={id} value={id} size="sm">
							{label}
						</TabsTab>
					))}
				</TabsList>
				<TabsPanel value="now-playing" keepMounted className="flex flex-col gap-4">
					<NowPlaying
						refreshing={refreshing}
						session={session}
						busy={controlMutation.isPending || !session.viewer.canControl}
						onControl={(action) => controlMutation.mutate(action)}
						receivedAt={sessionQuery.dataUpdatedAt}
					/>
					{session.viewer.canControl && (
						<AddToQueue
							refreshing={refreshing}
							sessionId={sessionId}
							disabled={controlMutation.isPending}
							adding={controlMutation.isPending && controlMutation.variables?.path === "queue/add"}
							onAdd={(query) => controlMutation.mutate({ path: "queue/add", body: { query } })}
						/>
					)}
				</TabsPanel>
				<TabsPanel value="queue" keepMounted>
					<QueueList
						refreshing={refreshing}
						session={session}
						busy={controlMutation.isPending || !session.viewer.canControl}
						onControl={(action) => controlMutation.mutate(action)}
					/>
				</TabsPanel>
			</Tabs>
		</main>
	);
}
