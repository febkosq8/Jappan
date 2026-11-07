import { Avatar, Button, Card, DateHandler, Tag, TextLink } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiMusic, FiPower, FiRefreshCw, FiXCircle } from "react-icons/fi";
import { toast } from "sonner";

import { AccessRedirect, accessErrorStatus } from "@jappan/components/jappan/AdminRoute";
import ExternalTextLink from "@jappan/components/jappan/ExternalTextLink";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";
import APIHandler, { type AdminBotPlayerSession } from "@jappan/handlers/APIHandler";

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
					<div>
						<dt className="text-muted-foreground">Voice channel</dt>
						<dd className="mt-1 wrap-break-words font-medium">
							{session.channel ? (
								<>
									<ExternalTextLink
										href={`https://discord.com/channels/${encodeURIComponent(session.guild.id)}/${encodeURIComponent(session.channel.id)}`}
										text={session.channel.name}
									/>{" "}
									({session.channel.id})
								</>
							) : (
								"Not connected"
							)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Requested by</dt>
						<dd className="mt-1 wrap-break-words font-medium">
							{session.user ? (
								<span className="flex min-w-0 items-center gap-2">
									<Avatar
										name={session.user.username}
										image={session.user.avatarUrl}
										size="sm"
										aria-hidden="true"
									/>
									<span className="min-w-0">
										<ExternalTextLink
											href={`https://discord.com/users/${encodeURIComponent(session.user.id)}`}
											text={session.user.username}
										/>
										<span className="block break-all text-xs text-muted-foreground">
											{session.user.id}
										</span>
									</span>
								</span>
							) : (
								"Unavailable"
							)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Queue size</dt>
						<dd className="mt-1 font-medium">{session.queueSize}</dd>
					</div>
					<div className="min-w-0">
						<dt className="text-muted-foreground">Now playing</dt>
						<dd className="mt-1 wrap-break-word font-medium">
							{session.nowPlaying?.url ? (
								<ExternalTextLink href={session.nowPlaying.url} text={session.nowPlaying.name} />
							) : (
								(session.nowPlaying?.name ?? "Nothing")
							)}
						</dd>
					</div>
				</dl>
			</Card.Content>
		</Card>
	);
}

export default function ManageBot() {
	document.title = "Admin - Manage Bot";
	const queryClient = useQueryClient();
	const [confirmStop, setConfirmStop] = useState(false);
	const [shutdownScheduled, setShutdownScheduled] = useState(false);
	const statusQuery = useQuery({
		queryKey: ["admin", "bot", "status"],
		queryFn: APIHandler.getAdminBotStatus,
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
			setConfirmStop(false);
		},
	});

	const accessStatus = accessErrorStatus(statusQuery.error) ?? accessErrorStatus(playerStateQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const bot = statusQuery.data;
	const content = (
		<div className="mt-6 space-y-6">
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
										dateTime={new Date(bot.bootedAtMs).toISOString()}
										title={DateHandler.getFormattedTime(bot.bootedAtMs, "$ISO$ ($RELATIVE$)")}
									>
										{`${DateHandler.getDateTime(bot.bootedAtMs)}\n${DateHandler.getRelativeTime(bot.bootedAtMs)}`}
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
						<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
									Run the same player health check as <code>/admin-bot refresh-player-health</code>.
								</p>
							</div>
							<Button
								size="sm"
								variant="outline-primary"
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
								<FiRefreshCw className="mr-2 size-4" aria-hidden="true" />
								Refresh player health
							</Button>
						</div>
						<div className="border-t border-border pt-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h3 className="font-semibold">Stop bot</h3>
									<p className="text-sm text-muted-foreground">
										Shuts down the bot process after a 5-second delay.
									</p>
								</div>
								{!confirmStop && (
									<Button
										size="sm"
										variant="outline-destructive"
										disabled={isFetchingStatus || shutdownScheduled}
										onClick={() => setConfirmStop(true)}
									>
										<FiPower className="mr-2 size-4" aria-hidden="true" />
										{shutdownScheduled ? "Shutdown scheduled" : "Stop bot"}
									</Button>
								)}
							</div>
							{confirmStop && (
								<div role="alert" className="mt-4 rounded-md border border-warning p-3">
									<div className="flex items-start gap-2">
										<FiAlertTriangle
											className="mt-0.5 size-4 shrink-0 text-warning"
											aria-hidden="true"
										/>
										<p className="text-sm">
											This will stop the bot process for everyone. Confirm to schedule shutdown.
										</p>
									</div>
									<div className="mt-3 flex justify-end gap-2">
										<Button
											size="sm"
											variant="outline-secondary"
											disabled={stopBotMutation.isPending}
											onClick={() => setConfirmStop(false)}
										>
											Cancel
										</Button>
										<Button
											size="sm"
											variant="destructive"
											disabled={isFetchingStatus || stopBotMutation.isPending}
											onClick={() => {
												void toast.promise(stopBotMutation.mutateAsync(), {
													loading: "Scheduling bot shutdown...",
													success: ({ delayMilliseconds }) =>
														`Bot shutdown scheduled in ${Math.ceil(delayMilliseconds / 1000)} seconds.`,
													error: "Could not schedule bot shutdown.",
												});
											}}
										>
											{stopBotMutation.isPending ? "Scheduling..." : "Confirm stop"}
										</Button>
									</div>
								</div>
							)}
							{shutdownScheduled && (
								<p role="status" className="mt-3 text-sm text-warning">
									Bot shutdown is scheduled. This page will become unavailable shortly.
								</p>
							)}
						</div>
					</Card.Content>
				</Card>
			</section>
		</div>
	);

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Manage Bot</h1>
					<p className="mt-1 text-muted-foreground">
						Inspect bot health, player sessions, and admin controls.
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
