import {
	Avatar,
	Button,
	Card,
	DateHandler,
	DoubleClickButton,
	Input,
	LabelField,
	Tag,
	Tabs,
	TabsList,
	TabsPanel,
	TabsTab,
	TextLink,
} from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiCheckCircle, FiHome, FiMusic, FiPower, FiRefreshCw, FiSettings, FiShield, FiXCircle } from "react-icons/fi";
import { toast } from "sonner";

import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type AdminBotPlayerSession } from "@jappan/handlers/APIHandler";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";
import { CONFIRM_CLICK_MS } from "@jappan/helpers/confirmClick";

const botSections = [
	{ id: "overview", label: "Overview", icon: FiHome },
	{ id: "player-sessions", label: "Player sessions", icon: FiMusic },
	{ id: "administrators", label: "Administrators", icon: FiShield },
	{ id: "admin-actions", label: "Admin actions", icon: FiSettings },
];

function readSectionFromHash() {
	const id = window.location.hash.slice(1);
	return botSections.some((section) => section.id === id) ? id : botSections[0].id;
}

function HealthCard({ label, healthy }: { label: string; healthy: boolean | undefined }) {
	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="flex items-center justify-between gap-3 p-3!">
				<h2 className="text-sm font-semibold">{label}</h2>
				<div className="flex min-w-0 flex-col items-end gap-1">
					{healthy === undefined ? (
						<LoadingIndicator rows={1} columns={5} size={80} label={`Loading ${label} health`} inline />
					) : (
						<Tag variant={healthy ? "success" : "destructive"} size="sm">
							{healthy ? (
								<FiCheckCircle className="mr-1 size-3.5" aria-hidden="true" />
							) : (
								<FiXCircle className="mr-1 size-3.5" aria-hidden="true" />
							)}
							{healthy ? "Healthy" : "Unhealthy"}
						</Tag>
					)}
				</div>
			</Card.Content>
		</Card>
	);
}

function PlayerSession({ session }: { session: AdminBotPlayerSession }) {
	return (
		<Card hoverable={false} className="rounded-md border-border">
			<Card.Content className="p-4!">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2">
						<Avatar name={session.guild.name} image={session.guild.icon} size="sm" aria-hidden="true" />
						<div className="min-w-0">
							<h3 className="font-semibold">
								<TextLink
									href={`/admin/guild/${encodeURIComponent(session.guild.id)}`}
									text={session.guild.name}
									title={session.guild.name}
									target="_self"
								/>
							</h3>
							<p className="text-xs text-muted-foreground">{session.guild.id}</p>
						</div>
					</div>
					<Tag variant="secondary" size="sm">
						{session.playerState}
					</Tag>
				</div>
				<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
					<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
						<dt className="text-muted-foreground">Voice channel</dt>
						<dd className="mt-1 wrap-break-words font-medium">
							{session.channel ? (
								<ChannelDisplay guildId={session.guild.id} {...session.channel} />
							) : (
								"Not connected"
							)}
						</dd>
					</Card>
					<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
						<dt className="text-muted-foreground">Owner</dt>
						<dd className="mt-1 wrap-break-words font-medium">
							<UserDisplay
								id={session.owner.id}
								name={session.owner.username}
								avatarUrl={session.owner.avatarUrl}
							/>
						</dd>
					</Card>
					<Card hoverable={false} className="min-w-0 rounded-md border-border p-3 sm:col-span-2">
						<dt className="text-muted-foreground">Player session ID</dt>
						<dd className="mt-1 break-all font-medium">
							<ExternalTextLink
								href={`/player/${encodeURIComponent(session.sessionId)}`}
								text={session.sessionId}
							/>
						</dd>
					</Card>
					<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
						<dt className="text-muted-foreground">Queue size</dt>
						<dd className="mt-1 font-medium">{session.queueSize}</dd>
					</Card>
					<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
						<dt className="text-muted-foreground">Now playing</dt>
						<dd className="mt-1 wrap-break-word font-medium">
							{session.nowPlaying?.url ? (
								<ExternalTextLink href={session.nowPlaying.url} text={session.nowPlaying.name} />
							) : (
								(session.nowPlaying?.name ?? "Nothing")
							)}
							{session.nowPlaying?.timestamp && (
								<span className="block text-xs text-muted-foreground">
									{session.nowPlaying.timestamp.current} /{" "}
									{session.nowPlaying.timestamp.total ?? "Unknown"}
								</span>
							)}
						</dd>
					</Card>
				</dl>
			</Card.Content>
		</Card>
	);
}

export default function ManageBot() {
	useDocumentTitle(formatTitle("Manage Bot", "Admin"));
	const queryClient = useQueryClient();
	const [section, setSection] = useState(readSectionFromHash);
	const [selfKickMessage, setSelfKickMessage] = useState("");
	const [shutdownScheduled, setShutdownScheduled] = useState(false);
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
	const statusQuery = useQuery({
		queryKey: ["bot-status"],
		queryFn: async () => {
			const startedAt = performance.now();
			const status = await APIHandler.getBotStatus();
			return { ...status, apiLatencyMs: Math.round(performance.now() - startedAt) };
		},
		refetchInterval: shutdownScheduled ? false : 30_000,
	});
	const healthQuery = useQuery({
		queryKey: ["health"],
		queryFn: APIHandler.getHealth,
		refetchInterval: shutdownScheduled ? false : 30_000,
	});
	const playerStateQuery = useQuery({
		queryKey: ["admin", "bot", "player-sessions"],
		queryFn: APIHandler.getAdminBotPlayerState,
		refetchInterval: shutdownScheduled ? false : 30_000,
	});
	const administratorsQuery = useQuery({
		queryKey: ["admin", "bot", "administrators"],
		queryFn: APIHandler.getAdminBotAdministrators,
		enabled: section === "administrators" && !shutdownScheduled,
		retry: false,
	});
	const isFetchingStatus = statusQuery.isFetching || healthQuery.isFetching || playerStateQuery.isFetching;

	const healthCheckMutation = useMutation({
		mutationFn: APIHandler.refreshAdminBotPlayerHealth,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["health"] });
		},
	});

	const stopBotMutation = useMutation({
		mutationFn: APIHandler.stopAdminBot,
		onSuccess: () => {
			setShutdownScheduled(true);
		},
	});

	const undeployMutation = useMutation({
		mutationFn: () => {
			const promise = APIHandler.undeployAdminBotGuildCommands();
			toast.promise(promise, {
				loading: "Removing guild commands…",
				success: (result) =>
					`Removed commands from ${result.undeployedGuilds.length} guilds; ${result.failedGuilds.length} failed.`,
				error: "Could not undeploy guild commands. Check guilds before retrying.",
			});
			return promise;
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["admin", "guild"] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "list-guilds"] });
		},
	});

	const selfKickMutation = useMutation({
		mutationFn: (message: string) => {
			const promise = APIHandler.selfKickAdminBot(message);
			toast.promise(promise, {
				loading: "Leaving guilds…",
				success: (result) => `Left ${result.leftGuilds.length} guilds; ${result.failedGuilds.length} failed.`,
				error: "Could not confirm the results. Check guilds before retrying.",
			});
			return promise;
		},
		onSuccess: () => {
			setSelfKickMessage("");
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["admin", "guild"] });
			void queryClient.invalidateQueries({ queryKey: ["user", "guild"] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "list-guilds"] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "bot", "status"] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "bot", "player-sessions"] });
		},
	});

	const accessStatus =
		accessErrorStatus(statusQuery.error) ??
		accessErrorStatus(playerStateQuery.error) ??
		accessErrorStatus(administratorsQuery.error) ??
		accessErrorStatus(undeployMutation.error) ??
		accessErrorStatus(selfKickMutation.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const bot = statusQuery.data;
	const content = (
		<Tabs value={section} onValueChange={changeSection} className="mt-6 gap-5">
			<TabsList aria-label="Bot sections" className="flex-wrap overflow-visible">
				{botSections.map(({ id, label, icon: Icon }) => (
					<TabsTab key={id} value={id} size="sm">
						<span className="inline-flex items-center gap-2">
							<Icon className="size-4" aria-hidden="true" />
							{label}
						</span>
					</TabsTab>
				))}
			</TabsList>
			<TabsPanel value="overview" keepMounted>
				<section aria-labelledby="bot-overview-heading">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<h2 id="bot-overview-heading" className="text-xl font-semibold">
							Bot overview
						</h2>
					</div>
					{!bot && statusQuery.isError ? (
						<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span>Could not load bot status. Check your access and try again.</span>
							<Button size="sm" variant="outline-primary" onClick={() => void statusQuery.refetch()}>
								Retry
							</Button>
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<Card hoverable={false} className="rounded-md border-border">
								<Card.Content className="flex min-h-24 flex-col items-start justify-between gap-3 p-3!">
									<h2 className="text-sm font-semibold">Bot identity</h2>
									{bot ? (
										<div className="flex min-w-0 items-center gap-2 self-end">
											<div className="min-w-0 text-right">
												<p className="truncate text-lg font-semibold">{bot.botName}</p>
												<p className="truncate text-sm text-muted-foreground">{bot.botId}</p>
											</div>
											<Avatar
												name={bot.botName}
												image={bot.botAvatarUrl}
												size="xl"
												aria-hidden="true"
											/>
										</div>
									) : (
										<div className="self-end">
											<LoadingIndicator
												rows={1}
												columns={5}
												size={80}
												label="Loading bot identity"
												inline
											/>
										</div>
									)}
								</Card.Content>
							</Card>
							<Card hoverable={false} className="rounded-md border-border">
								<Card.Content className="flex min-h-24 flex-col items-start justify-between gap-3 p-3!">
									<p className="text-sm font-semibold">Version</p>
									{bot ? (
										<strong className="self-end text-right text-lg">{bot.version}</strong>
									) : (
										<div className="self-end">
											<LoadingIndicator
												rows={1}
												columns={5}
												size={80}
												label="Loading bot version"
												inline
											/>
										</div>
									)}
								</Card.Content>
							</Card>
							<Card hoverable={false} className="rounded-md border-border">
								<Card.Content className="flex min-h-24 min-w-0 flex-col items-start justify-between gap-3 p-3!">
									<p className="text-sm font-semibold">Started</p>
									{bot ? (
										<time
											className="min-w-0 max-w-full truncate self-end text-right text-lg font-semibold whitespace-pre-wrap"
											dateTime={new Date(bot.bootedTimestampMs).toISOString()}
											title={DateHandler.getFormattedTime(
												bot.bootedTimestampMs,
												"$ISO$ ($RELATIVE$)",
											)}
										>
											{`${DateHandler.getDateTime(bot.bootedTimestampMs)}\n${DateHandler.getRelativeTime(bot.bootedTimestampMs)}`}
										</time>
									) : (
										<div className="self-end">
											<LoadingIndicator
												rows={1}
												columns={5}
												size={80}
												label="Loading bot start time"
												inline
											/>
										</div>
									)}
								</Card.Content>
							</Card>
							{[
								{ label: "Guilds", value: bot?.guildCount },
								{ label: "Members", value: bot?.memberCount },
							].map(({ label, value }) => (
								<Card key={label} hoverable={false} className="rounded-md border-border">
									<Card.Content className="flex min-h-24 flex-col items-start justify-between gap-3 p-3!">
										<p className="text-sm font-semibold">{label}</p>
										{bot ? (
											<div className="self-end text-right">
												<strong className="text-lg">
													{value == null ? "Unavailable" : value.toLocaleString()}
												</strong>
											</div>
										) : (
											<div className="self-end">
												<LoadingIndicator
													rows={1}
													columns={5}
													size={80}
													label={`Loading ${label.toLowerCase()} count`}
													inline
												/>
											</div>
										)}
									</Card.Content>
								</Card>
							))}
							{[
								{ label: "Gateway latency", value: bot?.gatewayLatencyMs },
								{ label: "Dashboard API latency", value: bot?.apiLatencyMs },
							].map(({ label, value }) => (
								<Card key={label} hoverable={false} className="rounded-md border-border">
									<Card.Content className="flex min-h-24 flex-col items-start justify-between gap-3 p-3!">
										<p className="text-sm font-semibold">{label}</p>
										{bot ? (
											<strong className="self-end text-right text-lg">
												{value == null ? "Unavailable" : `${value.toLocaleString()} ms`}
											</strong>
										) : (
											<div className="self-end">
												<LoadingIndicator
													rows={1}
													columns={5}
													size={80}
													label={`Loading ${label.toLowerCase()}`}
													inline
												/>
											</div>
										)}
									</Card.Content>
								</Card>
							))}
						</div>
					)}
					<section aria-labelledby="bot-health-heading" className="mt-4">
						<div className="mb-2 flex flex-wrap items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								<h3 id="bot-health-heading" className="text-lg font-semibold">
									Health
								</h3>
								<Button
									size="sm"
									variant="outline-secondary"
									className="group/refetch"
									disabled={healthQuery.isFetching || shutdownScheduled}
									onClick={() => void healthQuery.refetch()}
								>
									<FiRefreshCw
										className="mr-2 size-4 shrink-0 group-hover/refetch:animate-spin"
										aria-hidden="true"
									/>
									Refresh
								</Button>
							</div>
							<Tag
								variant={
									healthQuery.data ? (healthQuery.data.healthy ? "success" : "warning") : "secondary"
								}
								size="sm"
							>
								{healthQuery.data
									? healthQuery.data.healthy
										? "All services healthy"
										: "Service issue detected"
									: healthQuery.isError
										? "Health unavailable"
										: "Checking health"}
							</Tag>
						</div>
						{healthQuery.data || healthQuery.isPending ? (
							<>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<HealthCard label="Database" healthy={healthQuery.data?.services.db} />
									<HealthCard label="Discord bot" healthy={healthQuery.data?.services.discord} />
									<HealthCard label="Music player" healthy={healthQuery.data?.services.player} />
								</div>
								{healthQuery.data && (
									<p className="mt-2 text-xs text-muted-foreground">
										Fetched at: {DateHandler.getDateTime(healthQuery.dataUpdatedAt)}
									</p>
								)}
								{healthQuery.isError && (
									<p role="status" className="mt-2 text-sm text-warning">
										Could not refresh service health. Showing the last loaded data.
									</p>
								)}
							</>
						) : healthQuery.isError ? (
							<div
								role="alert"
								className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
							>
								<span>Could not load service health.</span>
								<Button
									size="sm"
									variant="outline-primary"
									disabled={healthQuery.isFetching}
									onClick={() => void healthQuery.refetch()}
								>
									Retry
								</Button>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">Loading service health...</p>
						)}
					</section>
				</section>
			</TabsPanel>
			<TabsPanel value="player-sessions" keepMounted>
				<section aria-labelledby="player-sessions-heading">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<FiMusic className="size-5 text-muted-foreground" aria-hidden="true" />
							<h2 id="player-sessions-heading" className="text-xl font-semibold">
								Active player sessions
							</h2>
							{playerStateQuery.data && (
								<Tag variant="secondary" size="sm">
									{playerStateQuery.data.length}
								</Tag>
							)}
						</div>
						<Button
							size="sm"
							variant="outline-secondary"
							className="group/refetch"
							disabled={playerStateQuery.isFetching || shutdownScheduled}
							onClick={() => void playerStateQuery.refetch()}
						>
							<FiRefreshCw
								className="mr-2 size-4 shrink-0 group-hover/refetch:animate-spin"
								aria-hidden="true"
							/>
							Refresh
						</Button>
					</div>
					{!playerStateQuery.data && playerStateQuery.isPending ? (
						<LoadingIndicator rows={1} columns={5} size={80} label="Loading player sessions" inline />
					) : !playerStateQuery.data ? (
						<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span>Could not load player sessions.</span>
							<Button
								size="sm"
								variant="outline-primary"
								disabled={playerStateQuery.isFetching}
								onClick={() => void playerStateQuery.refetch()}
							>
								Retry
							</Button>
						</div>
					) : playerStateQuery.data.length === 0 ? (
						<p className="text-sm text-muted-foreground">No active player sessions.</p>
					) : (
						<ul className="space-y-3">
							{playerStateQuery.data.map((session) => (
								<li key={session.guild.id}>
									<PlayerSession session={session} />
								</li>
							))}
						</ul>
					)}
					{playerStateQuery.isError && playerStateQuery.data && (
						<p role="status" className="mt-2 text-sm text-warning">
							Could not refresh player sessions. Showing the last loaded data.
						</p>
					)}
				</section>
			</TabsPanel>
			<TabsPanel value="administrators" keepMounted>
				<Card hoverable={false} className="rounded-md border-border p-5 sm:p-6">
					<h2 className="text-xl font-semibold">Bot administrators</h2>
					<p className="mt-1 text-sm text-muted-foreground">Administrators configured for this bot.</p>
					{administratorsQuery.isPending && administratorsQuery.isFetching ? (
						<LoadingIndicator label="Loading bot administrators" inline size={80} rows={1} columns={5} />
					) : administratorsQuery.isError ? (
						<div role="alert" className="mt-3 flex flex-wrap items-center gap-2">
							<p className="text-sm text-destructive">Could not load bot administrators.</p>
							<Button
								size="sm"
								variant="outline-primary"
								onClick={() => void administratorsQuery.refetch()}
							>
								Retry
							</Button>
						</div>
					) : administratorsQuery.data?.length === 0 ? (
						<p className="mt-3 text-sm text-muted-foreground">No bot administrators are configured.</p>
					) : administratorsQuery.data ? (
						<ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{administratorsQuery.data.map((administrator) => (
								<li key={administrator.id} className="min-w-0 rounded-md border border-border p-3">
									<UserDisplay
										id={administrator.id}
										name={administrator.username}
										avatarUrl={administrator.avatarUrl}
										size="sm"
									/>
								</li>
							))}
						</ul>
					) : null}
				</Card>
			</TabsPanel>
			<TabsPanel value="admin-actions" keepMounted>
				<section aria-labelledby="bot-actions-heading">
					<h2 id="bot-actions-heading" className="mb-3 text-xl font-semibold">
						Admin actions
					</h2>
					<Card hoverable={false} className="rounded-md border-border">
						<Card.Content className="space-y-4 p-4!">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h3 className="font-semibold">Refresh player health</h3>
									<p className="text-sm text-muted-foreground">
										Run the same player health check as{" "}
										<code>/admin-bot refresh-player-health</code>.
									</p>
								</div>
								<Button
									size="sm"
									variant="outline-primary"
									className="group/refetch"
									disabled={isFetchingStatus || healthCheckMutation.isPending || shutdownScheduled}
									onClick={() => {
										void toast.promise(healthCheckMutation.mutateAsync(), {
											loading: "Checking player health...",
											success: ({ healthy }) =>
												healthy
													? "Player health check passed."
													: "Player is unavailable after the health check.",
											error: "Could not refresh player health.",
										});
									}}
								>
									<FiRefreshCw
										className="mr-2 size-4 shrink-0 group-hover/refetch:animate-spin"
										aria-hidden="true"
									/>
									Refresh player health
								</Button>
							</div>
							<div className="border-t border-border pt-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 className="font-semibold">Undeploy guild commands</h3>
										<p className="text-sm text-muted-foreground">
											Remove guild commands from every installed guild. Global commands are
											unaffected.
										</p>
									</div>
									<DoubleClickButton
										doubleClickMsDuration={CONFIRM_CLICK_MS}
										size="sm"
										variant="outline-destructive"
										feedbackContent="Click again to undeploy"
										disabled={
											shutdownScheduled ||
											stopBotMutation.isPending ||
											undeployMutation.isPending ||
											selfKickMutation.isPending
										}
										onDoubleClick={() => undeployMutation.mutate()}
									>
										{undeployMutation.isPending ? "Undeploying..." : "Undeploy guild commands"}
									</DoubleClickButton>
								</div>
								{undeployMutation.isPending && (
									<p role="status" className="mt-3 text-sm text-muted-foreground">
										Removing guild commands. This may take several minutes.
									</p>
								)}
								{undeployMutation.isError && (
									<p role="alert" className="mt-3 text-sm text-destructive">
										{axios.isAxiosError(undeployMutation.error) && !undeployMutation.error.response
											? "Could not confirm the result. The operation may still be running; check guilds before retrying."
											: axios.isAxiosError(undeployMutation.error) &&
												  undeployMutation.error.response?.status === 409
												? "A guild command undeployment is already in progress."
												: "Could not undeploy guild commands. Some guilds may have been processed; check guilds before retrying."}
									</p>
								)}
								{undeployMutation.data && (
									<div role="status" className="mt-3 space-y-2 text-sm">
										<p>
											Commands removed from{" "}
											{undeployMutation.data.undeployedGuilds.length.toLocaleString()} guilds;{" "}
											{undeployMutation.data.failedGuilds.length.toLocaleString()} failed.
										</p>
										{undeployMutation.data.timeLimitReached && (
											<p className="text-warning">
												The time limit was reached before all guilds were processed. Run again
												to continue.
											</p>
										)}
										{undeployMutation.data.failedGuilds.length > 0 && (
											<div>
												<p className="font-medium text-destructive">Failed guilds:</p>
												<ul className="mt-1 list-inside list-disc">
													{undeployMutation.data.failedGuilds.map((guild) => (
														<li key={guild.id}>
															<TextLink
																href={`/admin/guild/${encodeURIComponent(guild.id)}`}
																text={guild.name}
																title={guild.name}
																target="_self"
															/>
														</li>
													))}
												</ul>
												<p className="mt-1 text-warning">Run again to retry failed guilds.</p>
											</div>
										)}
									</div>
								)}
							</div>
							<div className="border-t border-border pt-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 className="font-semibold">Leave guilds</h3>
										<p className="text-sm text-muted-foreground">
											Leave every installed guild except the configured player health-check guild.
											If that guild is not installed or configured, the bot leaves every guild. It
											still leaves if a departure message cannot be sent.
										</p>
									</div>
									<DoubleClickButton
										doubleClickMsDuration={CONFIRM_CLICK_MS}
										size="sm"
										variant="outline-destructive"
										feedbackContent="Click again to leave"
										disabled={
											shutdownScheduled ||
											stopBotMutation.isPending ||
											undeployMutation.isPending ||
											selfKickMutation.isPending
										}
										onDoubleClick={() => selfKickMutation.mutate(selfKickMessage)}
									>
										{selfKickMutation.isPending ? "Leaving guilds..." : "Leave guilds"}
									</DoubleClickButton>
								</div>
								<div className="mt-3">
									<LabelField
										id="bot-self-kick-message"
										label="Additional departure message (optional)"
										className="mb-1"
									/>
									<Input
										as="textarea"
										id="bot-self-kick-message"
										value={selfKickMessage}
										onChange={(event) => setSelfKickMessage(event.target.value)}
										maxLength={1000}
										rows={3}
										placeholder="Write the message to send"
										disabled={selfKickMutation.isPending}
										className="min-h-20 w-full"
									/>
								</div>
								{selfKickMutation.isPending && (
									<p role="status" className="mt-3 text-sm text-muted-foreground">
										Leaving guilds. This may take several minutes.
									</p>
								)}
								{selfKickMutation.isError && (
									<p role="alert" className="mt-3 text-sm text-destructive">
										{axios.isAxiosError(selfKickMutation.error) &&
										selfKickMutation.error.response?.status === 409
											? "A self-kick is already in progress."
											: "Could not confirm the results. The bot may have left some guilds or the operation may still be running; check guilds before retrying."}
									</p>
								)}
								{selfKickMutation.data && (
									<div role="status" className="mt-3 space-y-2 text-sm">
										<p>
											Left {selfKickMutation.data.leftGuilds.length.toLocaleString()} guilds;{" "}
											{selfKickMutation.data.failedGuilds.length.toLocaleString()} failed.
										</p>
										<p>
											{selfKickMutation.data.protectedGuild
												? `Kept player health-check guild: ${selfKickMutation.data.protectedGuild.name}.`
												: "No installed player health-check guild was protected."}
										</p>
										{selfKickMutation.data.timeLimitReached && (
											<p className="text-warning">
												The time limit was reached. Run again to continue.
											</p>
										)}
										{selfKickMutation.data.leftGuilds.some((guild) => !guild.messageSent) && (
											<div>
												<p className="font-medium text-warning">
													Left without sending a departure message:
												</p>
												<ul className="mt-1 list-inside list-disc">
													{selfKickMutation.data.leftGuilds
														.filter((guild) => !guild.messageSent)
														.map((guild) => (
															<li key={guild.id}>
																{guild.name} ({guild.id})
															</li>
														))}
												</ul>
											</div>
										)}
										{selfKickMutation.data.failedGuilds.length > 0 && (
											<div>
												<p className="font-medium text-destructive">Failed guilds:</p>
												<ul className="mt-1 list-inside list-disc">
													{selfKickMutation.data.failedGuilds.map((guild) => (
														<li key={guild.id}>
															{guild.name} ({guild.id})
															{guild.messageSent ? " — departure message sent" : ""}
														</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}
							</div>
							<div className="border-t border-border pt-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 className="font-semibold">Stop bot</h3>
										<p className="text-sm text-muted-foreground">
											Shuts down the bot process for everyone after a 5-second delay.
										</p>
									</div>
									<DoubleClickButton
										doubleClickMsDuration={CONFIRM_CLICK_MS}
										size="sm"
										variant="outline-destructive"
										feedbackContent="Click again to stop"
										disabled={
											isFetchingStatus ||
											shutdownScheduled ||
											stopBotMutation.isPending ||
											undeployMutation.isPending ||
											selfKickMutation.isPending
										}
										onDoubleClick={() => {
											void toast.promise(stopBotMutation.mutateAsync(), {
												loading: "Scheduling bot shutdown...",
												success: ({ delayMilliseconds }) =>
													`Bot shutdown scheduled in ${Math.ceil(delayMilliseconds / 1000)} seconds.`,
												error: "Could not schedule bot shutdown.",
											});
										}}
									>
										<span className="inline-flex items-center">
											<FiPower className="mr-2 size-4" aria-hidden="true" />
											{stopBotMutation.isPending
												? "Scheduling..."
												: shutdownScheduled
													? "Shutdown scheduled"
													: "Stop bot"}
										</span>
									</DoubleClickButton>
								</div>
								{shutdownScheduled && (
									<p role="status" className="mt-3 text-sm text-warning">
										Bot shutdown is scheduled. This page will become unavailable shortly.
									</p>
								)}
							</div>
						</Card.Content>
					</Card>
				</section>
			</TabsPanel>
		</Tabs>
	);

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Manage Bot</h1>
					<p className="mt-1 text-muted-foreground">
						Inspect bot health, player sessions, administrators, and admin controls.
					</p>
				</div>
			</div>
			{statusQuery.isError && statusQuery.data && (
				<p role="status" className="mt-4 text-sm text-warning">
					Could not refresh bot status. Showing the last loaded data.
				</p>
			)}
			{content}
		</main>
	);
}
