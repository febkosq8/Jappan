import { Avatar, Button, Card, DateHandler, PillLink, Tabs, TabsList, TabsPanel, TabsTab, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import {
	FiAlertTriangle,
	FiArrowLeft,
	FiGlobe,
	FiInfo,
	FiLock,
	FiUnlock,
	FiUsers,
	FiVolume2,
	FiLoader,
	FiWifi,
	FiWifiOff,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { RiSignalWifiErrorLine } from "react-icons/ri";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import AddToQueue from "@jappan/components/player/AddToQueue";
import NowPlaying from "@jappan/components/player/NowPlaying";
import PlayerLoading from "@jappan/components/player/PlayerLoading";
import getErrorMessage from "@jappan/helpers/getErrorMessage";
import { playerSections, readSectionFromHash } from "@jappan/helpers/playerSections";
import QueueList from "@jappan/components/player/QueueList";
import RefreshIndicator from "@jappan/components/player/RefreshIndicator";
import APIHandler, { type PlayerControlAction, type PlayerSession } from "@jappan/handlers/APIHandler";
import { sessionQueryKey } from "@jappan/handlers/auth";
import usePlayerWebsocket from "@jappan/handlers/usePlayerWebsocket";
import { WebsocketRequestError } from "@jappan/handlers/websocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

// How often the player state is refreshed over HTTP while the WebSocket is not connected, in milliseconds
const POLL_INTERVAL_MS = 5000;
// While the WebSocket is connected the page only reloads occasionally. It keeps the sign-in session fresh and
// corrects anything that was missed.
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;

type ConnectionState = "connected" | "connecting" | "limited" | "disconnected";

const CONNECTION_DISPLAY: Record<
	ConnectionState,
	{ label: string; description: string; variant: "success" | "secondary" | "warning" | "destructive"; Icon: IconType }
> = {
	connected: {
		label: "Connected",
		description: "Live updates and controls are working.",
		variant: "success",
		Icon: FiWifi,
	},
	connecting: {
		label: "Connecting",
		description: "Opening the live connection.",
		variant: "secondary",
		Icon: FiLoader,
	},
	limited: {
		label: "Limited connectivity",
		description: "The live connection is down. The player refreshes every few seconds and controls are paused.",
		variant: "warning",
		Icon: RiSignalWifiErrorLine,
	},
	disconnected: {
		label: "Disconnected",
		description: "The player cannot be reached. Showing the last loaded data.",
		variant: "destructive",
		Icon: FiWifiOff,
	},
};

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

	const [socketConnected, setSocketConnected] = useState(false);
	const sessionQuery = useQuery({
		queryKey,
		queryFn: () => APIHandler.getPlayerSession(sessionId),
		enabled: sessionId !== "" && !ended,
		refetchInterval: (query) =>
			query.state.error ? false : socketConnected ? KEEPALIVE_INTERVAL_MS : POLL_INTERVAL_MS,
	});

	// The session ID joins the title once the session has loaded
	useDocumentTitle(formatTitle(sessionQuery.data ? `Web Player: ${sessionId}` : "Web Player"));

	const endSession = () => {
		setEnded(true);
		queryClient.removeQueries({ queryKey });
	};
	const websocket = usePlayerWebsocket({
		sessionId,
		// Loaded over HTTP first, which also reports access problems with the proper status
		enabled: sessionQuery.data !== undefined && !ended,
		onState: (state: PlayerSession) => queryClient.setQueryData(queryKey, state),
		onEnded: endSession,
		// The HTTP endpoint explains why access was refused (sign in again, not a member, session gone)
		onAccessProblem: () => void queryClient.invalidateQueries({ queryKey }),
	});
	const connected = websocket.status === "connected";
	if (connected !== socketConnected) {
		setSocketConnected(connected);
	}

	const controlMutation = useMutation<string | undefined, unknown, PlayerControlAction>({
		mutationFn: (action) => {
			const request = websocket.control(action);
			const messages = CONTROL_TOAST_MESSAGES[action.path];
			toast.promise(request, {
				loading: messages.loading,
				// A notice means the change worked but only in part, for example a playlist that did not fully fit
				success: (notice) => notice ?? messages.success,
				error: (error: unknown) => getErrorMessage(error, "The player action failed."),
			});
			return request;
		},
		onSuccess: (_result, action) => {
			if (action.path === "stop") {
				endSession();
			}
			// Any other change arrives as a pushed state, so nothing is refetched here
		},
		onError: (error) => {
			if (error instanceof WebsocketRequestError && error.status === 401) {
				void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
			}
			// The control was refused or lost, so show what the player really looks like
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

	// The socket carries live updates and controls. Without it the page falls back to HTTP polling, which only
	// keeps the view fresh; if that fails too, the player cannot be reached at all.
	const connectionState: ConnectionState = connected
		? "connected"
		: websocket.status === "connecting"
			? "connecting"
			: sessionQuery.isError
				? "disconnected"
				: "limited";
	const connection = CONNECTION_DISPLAY[connectionState];
	const refreshing = controlMutation.isPending || sessionQuery.isFetching || websocket.status === "connecting";
	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
			<div className="mb-4 grid gap-4 sm:grid-cols-2">
				<Card hoverable={false} className="rounded-md border-border">
					<Card.Content className="flex items-center justify-start gap-3 p-4!">
						<Avatar
							name={session.guild.name}
							image={session.guild.iconUrl}
							size="xl"
							className="size-12 text-xl"
							aria-hidden="true"
						/>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-muted-foreground">Server</p>
							<h1 className="wrap-break-word text-lg font-bold tracking-tight">
								<ExternalTextLink
									href={`https://discord.com/channels/${encodeURIComponent(session.guild.id)}`}
									text={session.guild.name}
								/>
							</h1>
						</div>
					</Card.Content>
				</Card>
				<Card hoverable={false} className="rounded-md border-border">
					<Card.Content className="relative flex h-full flex-col justify-center p-4!">
						<RefreshIndicator active={refreshing} className="absolute right-4 top-4" />
						<p className="text-sm font-semibold text-muted-foreground">Voice channel</p>
						<h2 className="flex items-start gap-2 text-xl font-bold tracking-tight">
							<FiVolume2 className="mt-1.25 size-5 shrink-0 text-primary" aria-hidden="true" />
							<span className="wrap-break-word">
								{session.channel ? (
									<ExternalTextLink
										href={`https://discord.com/channels/${encodeURIComponent(session.guild.id)}/${encodeURIComponent(session.channel.id)}`}
										text={session.channel.name}
									/>
								) : (
									"Not connected"
								)}
							</span>
						</h2>
						{session.channel && (
							<div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
								<p className="flex items-center gap-1.5">
									<FiUsers className="size-4 shrink-0" aria-hidden="true" />
									{session.channel.listenerCount} listening
								</p>
								<p className="flex items-center gap-1.5 capitalize">
									<FiGlobe className="size-4 shrink-0" aria-hidden="true" />
									{session.channel.region?.replace(/-/g, " ") ?? "Automatic"}
								</p>
							</div>
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
										disabled={controlMutation.isPending || !connected}
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
						<div className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
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
												at{" "}
												{DateHandler.getDateTime(
													session.lastChangedBy.timestampMs,
													"hh:mm:ss a",
												)}
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
							<div className="min-w-0">
								<p className="text-sm font-semibold text-muted-foreground">Web player connection</p>
								<div className="flex h-10 items-center">
									<Tag variant={connection.variant} size="xs" title={connection.description}>
										<connection.Icon className="mr-1 size-3" aria-hidden="true" />
										{connection.label}
									</Tag>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card>
			</div>
			{!session.viewer.inVoiceChannel && (
				<Card hoverable={false} className="mb-4 rounded-md border-border">
					<Card.Content
						role="status"
						className="flex items-center justify-start gap-3 p-4! text-left text-sm"
					>
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
					<Card.Content
						role="status"
						className="flex items-center justify-start gap-3 p-4! text-left text-sm"
					>
						<FiLock className="size-5 shrink-0 text-warning" aria-hidden="true" />
						<span>
							The session owner locked this player.
							<br />
							You can watch the queue, but only the owner can change it.
						</span>
					</Card.Content>
				</Card>
			)}
			{websocket.status === "disconnected" && (
				<Card
					hoverable={false}
					className={`mb-4 rounded-md ${connectionState === "disconnected" ? "border-destructive" : "border-warning"}`}
				>
					<Card.Content
						role="status"
						className="flex items-center justify-start gap-3 p-4! text-left text-sm"
					>
						<FiWifiOff
							className={`size-5 shrink-0 ${connectionState === "disconnected" ? "text-destructive" : "text-warning"}`}
							aria-hidden="true"
						/>
						{connectionState === "disconnected" ? (
							<span>
								Disconnected from the player.
								<br />
								Controls are paused. Showing the last loaded data.
							</span>
						) : (
							<span>
								Live connection lost. Reconnecting…
								<br />
								Controls are paused until it is back. The player still refreshes every few seconds.
							</span>
						)}
					</Card.Content>
				</Card>
			)}
			{/* When the connection card is up it already says the data is stale */}
			{sessionQuery.isError && websocket.status !== "disconnected" && (
				<Card hoverable={false} className="mb-4 rounded-md border-warning">
					<Card.Content
						role="status"
						className="flex items-center justify-start gap-3 p-4! text-left text-sm text-warning"
					>
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
				<TabsPanel value="now-playing" keepMounted>
					<NowPlaying
						refreshing={refreshing}
						session={session}
						busy={controlMutation.isPending || !connected || !session.viewer.canControl}
						onControl={(action) => controlMutation.mutate(action)}
						receivedAt={sessionQuery.dataUpdatedAt}
						live={connectionState !== "disconnected"}
					/>
				</TabsPanel>
				<TabsPanel value="queue" keepMounted className="flex flex-col gap-4">
					{session.viewer.canControl && (
						<AddToQueue
							sessionId={sessionId}
							disabled={controlMutation.isPending || !connected}
							adding={controlMutation.isPending && controlMutation.variables?.path === "queue/add"}
							onAdd={(query) => controlMutation.mutate({ path: "queue/add", body: { query } })}
							loadSuggestions={websocket.suggestions}
						/>
					)}
					<QueueList
						refreshing={refreshing}
						session={session}
						busy={controlMutation.isPending || !connected || !session.viewer.canControl}
						onControl={(action) => controlMutation.mutate(action)}
					/>
				</TabsPanel>
			</Tabs>
		</main>
	);
}
