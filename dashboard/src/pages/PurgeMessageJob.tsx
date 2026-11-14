import { Button, Card, DateHandler, PillLink, Tabs, TabsList, TabsPanel, TabsTab, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
	FiActivity,
	FiAlertCircle,
	FiAlertTriangle,
	FiArrowLeft,
	FiCheckCircle,
	FiClock,
	FiEye,
	FiHome,
	FiLoader,
	FiSliders,
	FiWifi,
	FiWifiOff,
} from "react-icons/fi";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import GuildPageHeader from "@jappan/components/display/GuildPageHeader";
import UserDisplay from "@jappan/components/display/UserDisplay";
import GuildDetail from "@jappan/components/panel/GuildDetail";
import APIHandler, { type PurgeMessageJobState } from "@jappan/handlers/APIHandler";
import usePurgeMessageJobWebsocket from "@jappan/handlers/usePurgeMessageJobWebsocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const queryKey = (jobId: string) => ["purge-message-job", jobId] as const;

function jobVariant(job: PurgeMessageJobState): "destructive" | "warning" | "success" {
	if (job.status === "failed" || job.failedMessages > 0) return "destructive";
	if (
		!["complete", "failed", "cancelled"].includes(job.status) ||
		job.unprocessedMessages > 0 ||
		job.errors.length > 0
	)
		return "warning";
	return "success";
}

function jobLabel(job: PurgeMessageJobState): string {
	if (job.status === "awaiting_preview") return "Awaiting preview";
	if (job.status === "previewing") return "Preparing preview";
	if (job.status === "awaiting_confirmation") return "Awaiting confirmation";
	if (job.status === "cancelled") return "Cancelled";
	if (job.status === "running") return "In progress";
	if (job.status === "failed") return "Failed";
	if (job.status === "stopped") return "Stopped";
	if (job.failedMessages > 0 || job.unprocessedMessages > 0 || job.errors.length > 0) return "Partial results";
	return "Complete";
}

function actionError(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error) return error.response.data.error;
	if (error instanceof Error && !axios.isAxiosError(error)) return error.message;
	return "Could not update this job. Please try again.";
}

function latestState(current: PurgeMessageJobState | undefined, incoming: PurgeMessageJobState): PurgeMessageJobState {
	return current &&
		(current.version > incoming.version ||
			(current.version === incoming.version && current.serverTimestampMs > incoming.serverTimestampMs))
		? current
		: incoming;
}

function groupPreviewMessages(messages: NonNullable<PurgeMessageJobState["preview"]>["messages"]) {
	const groups = new Map<string, { channelId: string; channelName: string; messages: typeof messages }>();
	for (const message of messages) {
		let group = groups.get(message.channelId);
		if (!group) {
			group = { channelId: message.channelId, channelName: message.channelName, messages: [] };
			groups.set(message.channelId, group);
		}
		group.messages.push(message);
	}
	return [...groups.values()];
}

type MessageDeletionStatus = PurgeMessageJobState["messageStatuses"][string];
type MessageStatusCounts = Record<MessageDeletionStatus, number>;

const messageStatusOrder: MessageDeletionStatus[] = ["pending", "deleting", "deleted", "failed"];

function countMessageStatuses(
	messages: NonNullable<PurgeMessageJobState["preview"]>["messages"],
	statuses: PurgeMessageJobState["messageStatuses"],
): MessageStatusCounts {
	return messages.reduce<MessageStatusCounts>(
		(counts, message) => {
			counts[statuses[message.id] ?? "pending"] += 1;
			return counts;
		},
		{ pending: 0, deleting: 0, deleted: 0, failed: 0 },
	);
}

function messageStatusLabel(status: MessageDeletionStatus): string {
	return status === "deleting" ? "Deleting" : status[0]!.toUpperCase() + status.slice(1);
}

function messageStatusVariant(status: MessageDeletionStatus): "secondary" | "warning" | "success" | "destructive" {
	if (status === "deleting") return "warning";
	if (status === "deleted") return "success";
	if (status === "failed") return "destructive";
	return "secondary";
}

function MessageStatusTag({ status }: { status: MessageDeletionStatus }) {
	return (
		<Tag variant={messageStatusVariant(status)} size="xs">
			{messageStatusLabel(status)}
		</Tag>
	);
}

function PurgeMessageList({
	guildId,
	messages,
	messageStatuses,
	showStatuses,
	expandedChannelId,
	onToggleChannel,
}: {
	guildId: string;
	messages: NonNullable<PurgeMessageJobState["preview"]>["messages"];
	messageStatuses: PurgeMessageJobState["messageStatuses"];
	showStatuses: boolean;
	expandedChannelId: string | null;
	onToggleChannel: (channelId: string) => void;
}) {
	return (
		<div className="max-h-96 space-y-3 overflow-y-auto">
			{groupPreviewMessages(messages).map((group) => {
				const counts = countMessageStatuses(group.messages, messageStatuses);
				return (
					<Card key={group.channelId} hoverable={false} className="min-w-0 border-border">
						<Card.Content className="space-y-3 p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<ChannelDisplay
									guildId={guildId}
									id={group.channelId}
									name={`#${group.channelName}`}
									showId
								/>
								<Tag variant="secondary" size="sm">
									{group.messages.length} total
								</Tag>
								{showStatuses && (
									<div className="flex flex-wrap gap-1">
										{messageStatusOrder.map((status) => (
											<Tag key={status} variant={messageStatusVariant(status)} size="xs">
												{counts[status]} {messageStatusLabel(status).toLowerCase()}
											</Tag>
										))}
									</div>
								)}
								<Button
									type="button"
									variant="outline-secondary"
									size="sm"
									aria-expanded={expandedChannelId === group.channelId}
									aria-controls={`purge-job-channel-${group.channelId}-messages`}
									onClick={() => onToggleChannel(group.channelId)}
								>
									{expandedChannelId === group.channelId ? "Hide" : "Show"} {group.messages.length}{" "}
									message{group.messages.length === 1 ? "" : "s"}
								</Button>
							</div>
							<ul
								id={`purge-job-channel-${group.channelId}-messages`}
								hidden={expandedChannelId !== group.channelId}
								className="space-y-2"
							>
								{group.messages.map((message) => {
									const textContent =
										message.embedContent === undefined && message.content === "(No text content)"
											? ""
											: message.content;
									const embedContent = message.embedContent ?? [];
									const supportedEmbedContent = embedContent.filter(
										(content): content is string => content !== null,
									);

									return (
										<li key={message.id} className="rounded-md border border-border p-3">
											<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
												<UserDisplay
													id={message.author.id}
													name={`${message.author.displayName} (@${message.author.username})`}
													avatarUrl={message.author.avatarUrl}
													size="sm"
													showId
												/>
												{showStatuses && (
													<MessageStatusTag
														status={messageStatuses[message.id] ?? "pending"}
													/>
												)}
												<a
													href={message.jumpUrl}
													target="_blank"
													rel="noreferrer"
													className="min-w-0 break-all text-center text-muted-foreground underline hover:text-primary"
												>
													Message ID: {message.id}
												</a>
												<span className="whitespace-nowrap text-center text-muted-foreground">
													{DateHandler.getDateTime(message.createdTimestampMs)}
												</span>
											</div>
											{(textContent || embedContent.length > 0) && (
												<div className="mt-3 space-y-3 text-sm">
													{textContent && (
														<div className="rounded-md border border-border bg-muted/30 p-3">
															<p className="mb-1 text-xs font-medium text-muted-foreground">
																Message
															</p>
															<p className="wrap-break-word whitespace-pre-wrap">
																{textContent}
															</p>
														</div>
													)}
													{supportedEmbedContent.length > 0
														? supportedEmbedContent.map((content, index) => (
																<section
																	key={`${message.id}-embed-${index}`}
																	className="overflow-hidden rounded-md border border-border border-l-4 border-l-primary bg-card"
																	aria-label={`Embed ${index + 1}`}
																>
																	<p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
																		Embed
																		{supportedEmbedContent.length > 1
																			? ` ${index + 1}`
																			: ""}
																	</p>
																	<p className="wrap-break-word whitespace-pre-wrap p-3">
																		{content}
																	</p>
																</section>
															))
														: !textContent &&
															embedContent.length > 0 && (
																<p
																	role="status"
																	className="rounded-md border border-warning bg-warning/10 p-3 font-medium text-warning"
																>
																	No supported content to preview
																</p>
															)}
												</div>
											)}
										</li>
									);
								})}
							</ul>
						</Card.Content>
					</Card>
				);
			})}
		</div>
	);
}

function WarningBanner({ children }: { children: ReactNode }) {
	return (
		<Card hoverable={false} className="rounded-md border-warning">
			<Card.Content role="status" className="flex items-center justify-start gap-3 p-0! text-left text-sm">
				<FiAlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
				<div className="min-w-0 flex-1">{children}</div>
			</Card.Content>
		</Card>
	);
}

export default function PurgeMessageJob() {
	const { jobId = "" } = useParams();
	const queryClient = useQueryClient();
	const [accessProblem, setAccessProblem] = useState(false);
	const [monotonicNow, setMonotonicNow] = useState(() => performance.now());
	const [confirmationPreviewId, setConfirmationPreviewId] = useState<string | null>(null);
	const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
	const [section, setSection] = useState<"overview" | "activity">("activity");
	const attemptedPreview = useRef("");
	const attemptedClockRefresh = useRef("");
	const updateState = (state: PurgeMessageJobState) =>
		queryClient.setQueryData<PurgeMessageJobState>(queryKey(jobId), (current) => latestState(current, state));
	const isValidJobId = jobIdPattern.test(jobId);
	const jobQuery = useQuery({
		queryKey: queryKey(jobId),
		queryFn: async () => {
			const state = await APIHandler.getPurgeMessageJob(jobId);
			return latestState(queryClient.getQueryData<PurgeMessageJobState>(queryKey(jobId)), state);
		},
		enabled: isValidJobId,
		retry: false,
	});
	const hasServerClock = jobQuery.isSuccess && Number.isSafeInteger(jobQuery.data.serverTimestampMs);
	const clockUnavailable = jobQuery.isSuccess && !jobQuery.isFetching && !hasServerClock;
	useEffect(() => {
		if (jobQuery.isSuccess && !hasServerClock && !jobQuery.isFetching && attemptedClockRefresh.current !== jobId) {
			attemptedClockRefresh.current = jobId;
			void jobQuery.refetch();
		}
	}, [hasServerClock, jobId, jobQuery.isSuccess, jobQuery.isFetching, jobQuery.refetch]);
	useEffect(() => setExpandedChannelId(null), [jobId, jobQuery.data?.preview?.previewId]);
	const active =
		jobQuery.isSuccess &&
		hasServerClock &&
		!["complete", "stopped", "failed", "cancelled"].includes(jobQuery.data.status) &&
		!accessProblem;
	const receivedAt = useMemo(() => performance.now(), [jobId, jobQuery.data?.serverTimestampMs]);
	useEffect(() => {
		if (!active) return;
		setMonotonicNow(performance.now());
		const timer = window.setInterval(() => setMonotonicNow(performance.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active, jobId]);

	useEffect(() => setAccessProblem(false), [jobId]);
	const prepareMutation = useMutation({
		mutationFn: () => {
			const promise = APIHandler.preparePurgeMessageJob(jobId);
			toast.promise(promise, {
				loading: "Preparing message preview…",
				success: "Message preview scan started.",
				error: actionError,
			});
			return promise;
		},
		onMutate: () => setConfirmationPreviewId(null),
		onSuccess: updateState,
	});
	const confirmMutation = useMutation({
		mutationFn: () => {
			const promise = Promise.resolve().then(() => {
				const preview = jobQuery.data?.preview;
				if (!preview || confirmationPreviewId !== preview.previewId)
					throw new Error("Review the current preview first.");
				return APIHandler.confirmPurgeMessageJob(jobId, preview.previewId);
			});
			toast.promise(promise, {
				loading: "Starting message deletion…",
				success: "Message deletion started.",
				error: actionError,
			});
			return promise;
		},
		onSuccess: updateState,
	});
	const cancelMutation = useMutation({
		mutationFn: () => {
			const promise = APIHandler.cancelPurgeMessageJob(jobId);
			toast.promise(promise, {
				loading: "Cancelling purge job…",
				success: "Purge job cancelled.",
				error: actionError,
			});
			return promise;
		},
		onSuccess: updateState,
	});
	useEffect(() => {
		if (
			jobQuery.data?.status !== "awaiting_preview" ||
			!hasServerClock ||
			accessProblem ||
			attemptedPreview.current === jobId
		)
			return;
		attemptedPreview.current = jobId;
		prepareMutation.mutate();
	}, [jobQuery.data?.status, jobId, hasServerClock, accessProblem, prepareMutation.mutate]);
	const websocket = usePurgeMessageJobWebsocket({
		jobId,
		enabled: jobQuery.isSuccess,
		onState: updateState,
		onAccessProblem: () => setAccessProblem(true),
	});

	useDocumentTitle(formatTitle(jobQuery.data ? `Purge job: ${jobQuery.data.guildName}` : "Purge job"));

	if (!isValidJobId || accessProblem || jobQuery.isError || clockUnavailable) {
		const status = axios.isAxiosError(jobQuery.error) ? jobQuery.error.response?.status : undefined;
		const notFound = !isValidJobId || status === 400 || status === 404;
		const denied = status === 403;
		const title = notFound ? "No purge job found" : denied ? "You can't view this job" : "Purge job unavailable";
		const message = clockUnavailable
			? "This job did not return a valid server time. Reload its latest state."
			: accessProblem
				? "This job is no longer available or you no longer have permission to view it."
				: denied
					? "You do not have permission to view this message purge job."
					: "Could not load message purge progress.";
		return (
			<main className="flex min-h-[calc(100dvh-4.0625rem)] flex-col items-center justify-center px-4 py-10 text-center">
				<FiAlertCircle className="size-10 text-muted-foreground" aria-hidden="true" />
				<h1 className="mt-4 text-3xl font-bold">{title}</h1>
				{notFound ? (
					<>
						<p className="mt-2 max-w-md text-muted-foreground">This can happen for a few reasons:</p>
						<ul className="mt-3 max-w-md list-disc space-y-1 pl-5 text-left text-muted-foreground">
							<li>The job has expired.</li>
							<li>The link is invalid or incomplete.</li>
							<li>The bot restarted, which clears stored jobs.</li>
						</ul>
						<p className="mt-3 max-w-md text-muted-foreground">
							Start a new job from your guild or use /purge-messages.
						</p>
					</>
				) : (
					<p role="alert" className="mt-2 max-w-md text-muted-foreground">
						{message}
					</p>
				)}
				<div className="mt-6 flex flex-wrap justify-center gap-3">
					{isValidJobId && !notFound && (
						<Button
							disabled={jobQuery.isFetching}
							onClick={() =>
								void jobQuery.refetch().then((result) => {
									if (result.isSuccess) setAccessProblem(false);
								})
							}
						>
							{jobQuery.isFetching ? "Trying again…" : "Try again"}
						</Button>
					)}
					<PillLink variant="outline-secondary" href="/guilds" className="gap-2">
						<FiArrowLeft aria-hidden="true" />
						Back to guilds
					</PillLink>
				</div>
			</main>
		);
	}
	if (jobQuery.isPending || !hasServerClock) {
		return (
			<main className="flex min-h-[calc(100dvh-4.0625rem)] items-center justify-center px-4 py-10">
				<LoadingIndicator label="Loading message purge job" />
			</main>
		);
	}

	const job = jobQuery.data;
	const now = job.serverTimestampMs + Math.max(0, monotonicNow - receivedAt);
	const beforeDeletion = ["awaiting_preview", "previewing", "awaiting_confirmation"].includes(job.status);
	const preview = job.preview;
	const messageStatusCounts = preview
		? countMessageStatuses(preview.messages, job.messageStatuses)
		: { pending: 0, deleting: 0, deleted: 0, failed: 0 };
	const previewExpired = Boolean(beforeDeletion && preview && preview.expiresAt <= now);
	const requestExpired = job.requestExpiresAtMs <= now;
	const actionBusy = prepareMutation.isPending || confirmMutation.isPending || cancelMutation.isPending;
	const StatusIcon =
		job.status === "running" || job.status === "previewing"
			? FiActivity
			: job.status === "complete" && jobVariant(job) === "success"
				? FiCheckCircle
				: FiAlertCircle;
	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				Guilds
			</PillLink>
			<GuildPageHeader
				title="Message purge job"
				guild={{ id: job.guildId, name: job.guildName, icon: job.guildIcon }}
				rightContent={
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Tag variant={jobVariant(job)} size="sm" className="gap-1.5">
							<StatusIcon aria-hidden="true" />
							{jobLabel(job)}
						</Tag>
						{beforeDeletion && (
							<Tag
								variant={requestExpired ? "warning" : "secondary"}
								size="sm"
								className="gap-1.5 tabular-nums"
								title={`Confirm by ${DateHandler.getDateTime(job.requestExpiresAtMs)}. Jobs expire 15 minutes after creation.`}
							>
								<FiClock aria-hidden="true" />
								{requestExpired
									? "Confirmation window expired"
									: `Expires in ${DateHandler.formatDuration(Math.ceil((job.requestExpiresAtMs - now) / 1000))}`}
							</Tag>
						)}
					</div>
				}
			/>

			<Tabs
				value={section}
				onValueChange={(value) => {
					if (value === "overview" || value === "activity") setSection(value);
				}}
				className="gap-5"
			>
				<TabsList aria-label="Purge job sections">
					<TabsTab value="overview" size="sm">
						<span className="inline-flex items-center gap-2">
							<FiHome className="size-4" aria-hidden="true" />
							Overview
						</span>
					</TabsTab>
					<TabsTab value="activity" size="sm">
						<span className="inline-flex items-center gap-2">
							<FiEye className="size-4" aria-hidden="true" />
							Preview and progress
						</span>
					</TabsTab>
				</TabsList>
				<TabsPanel value="overview" keepMounted>
					<div className="grid gap-4 md:grid-cols-2">
						<Card hoverable={false} className="min-w-0 p-5 sm:p-6">
							<h2 className="flex items-center gap-2 text-lg font-semibold">
								<FiSliders className="size-5 text-primary" aria-hidden="true" />
								Request
							</h2>
							<dl className="mt-5 grid gap-3 sm:grid-cols-2">
								<GuildDetail label="Channel scope">
									{job.selectedChannelId === undefined ? (
										"Not recorded for this job"
									) : job.selectedChannelId ? (
										<ChannelDisplay
											guildId={job.guildId}
											id={job.selectedChannelId}
											name={`#${job.channelName}`}
											showId
										/>
									) : (
										"All guild channels"
									)}
								</GuildDetail>
								<GuildDetail label="Maximum requested">{job.messageLimit.toLocaleString()}</GuildDetail>
								<GuildDetail label="Message author">
									{job.targetUserId === undefined ? (
										"Not recorded for this job"
									) : job.targetUserId ? (
										<UserDisplay id={job.targetUserId} name="Selected author" size="sm" />
									) : (
										"Any author"
									)}
								</GuildDetail>
								<GuildDetail
									label={`${job.regex ? "Regex" : "Text contains"} (${job.ignoreCase ? "ignore case" : "case-sensitive"})`}
								>
									{job.textFilter === undefined ? (
										"Not recorded for this job"
									) : job.textFilter ? (
										<span className="whitespace-pre-wrap">{job.textFilter}</span>
									) : (
										"No text filter"
									)}
								</GuildDetail>
							</dl>
						</Card>
						<Card hoverable={false} className="min-w-0 p-5 sm:p-6">
							<h2 className="flex items-center gap-2 text-lg font-semibold">
								<FiClock className="size-5 text-primary" aria-hidden="true" />
								Summary
							</h2>
							<dl className="mt-5 grid gap-3 sm:grid-cols-2">
								<GuildDetail label="Messages scanned">
									{job.scannedMessages.toLocaleString()}
								</GuildDetail>
								<GuildDetail label="Matches found">{job.matchedMessages.toLocaleString()}</GuildDetail>
								<GuildDetail label="Started">{DateHandler.getDateTime(job.startedAtMs)}</GuildDetail>
								{job.finishedAtMs !== null && (
									<GuildDetail label="Finished">
										{DateHandler.getDateTime(job.finishedAtMs)}
									</GuildDetail>
								)}
								<GuildDetail label="Time spent">
									<span className="tabular-nums">
										{DateHandler.formatDuration(
											Math.max(
												0,
												Math.floor(((job.finishedAtMs ?? now) - job.startedAtMs) / 1000),
											),
										)}
									</span>
								</GuildDetail>
							</dl>
						</Card>
					</div>
				</TabsPanel>
				<TabsPanel value="activity" keepMounted>
					<Card hoverable={false} className="min-w-0 p-5 sm:p-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="flex items-center gap-2 text-lg font-semibold">
								<FiActivity className="size-5 text-primary" aria-hidden="true" />
								Job progress
							</h2>
						</div>
						{(job.status === "running" || job.status === "previewing") && (
							<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
								{job.currentChannelId && job.currentChannelName && (
									<p className="min-w-0 wrap-break-word">
										{job.status === "previewing" ? "Scanning" : "Processing"}{" "}
										<ChannelDisplay
											guildId={job.guildId}
											id={job.currentChannelId}
											name={`#${job.currentChannelName}`}
										/>
									</p>
								)}
								<Tag
									role="status"
									variant={
										websocket.status === "connected"
											? "success"
											: websocket.status === "connecting"
												? "secondary"
												: "warning"
									}
									size="xs"
								>
									{websocket.status === "connected" ? (
										<FiWifi className="mr-1 size-3" aria-hidden="true" />
									) : websocket.status === "connecting" ? (
										<FiLoader className="mr-1 size-3 animate-spin" aria-hidden="true" />
									) : (
										<FiWifiOff className="mr-1 size-3" aria-hidden="true" />
									)}
									{websocket.status === "connected"
										? "Live updates connected"
										: websocket.status === "connecting"
											? "Connecting to live updates"
											: "Reconnecting to live updates"}
								</Tag>
							</div>
						)}

						<div className="mt-5 rounded-md border border-border bg-muted/30 p-4">
							<div className="flex items-end justify-between gap-3">
								<div>
									<p className="text-sm text-muted-foreground">
										{beforeDeletion ? "Preview progress" : "Overall progress"}
									</p>
									<p className="mt-1 text-3xl font-bold tabular-nums text-primary">
										{job.progressPercentage}%
									</p>
								</div>
								<p className="text-right text-sm text-muted-foreground">
									<span className="font-medium tabular-nums text-foreground">
										{job.completedChannels} / {job.channelCount}
									</span>{" "}
									{beforeDeletion ? "channels scanned" : "channels completed"}
								</p>
							</div>
							<div
								role="progressbar"
								aria-label={beforeDeletion ? "Message preview progress" : "Message purge progress"}
								aria-valuenow={job.progressPercentage}
								aria-valuemin={0}
								aria-valuemax={100}
								className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
							>
								<div
									className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
									style={{ width: `${job.progressPercentage}%` }}
								/>
							</div>
							<p role="status" className="mt-3 text-sm text-muted-foreground">
								{beforeDeletion
									? `${job.scannedMessages.toLocaleString()} messages scanned`
									: `${job.messagesProcessed.toLocaleString()} of ${job.messagesToDelete.toLocaleString()} messages processed`}
							</p>
						</div>

						<dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
							<GuildDetail label="Total">
								{(preview?.deleteCount ?? job.messagesToDelete).toLocaleString()}
							</GuildDetail>
							<GuildDetail label="Pending">
								<span className="text-2xl font-bold tabular-nums text-warning">
									{beforeDeletion ? job.unprocessedMessages : messageStatusCounts.pending}
								</span>
							</GuildDetail>
							<GuildDetail label="Deleting">
								<span className="text-2xl font-bold tabular-nums text-primary">
									{messageStatusCounts.deleting}
								</span>
							</GuildDetail>
							<GuildDetail label="Deleted">
								<span className="text-2xl font-bold tabular-nums text-success">
									{job.deletedMessages}
								</span>
							</GuildDetail>
							<GuildDetail label="Failed">
								<span
									className={`text-2xl font-bold tabular-nums ${job.failedMessages > 0 ? "text-destructive" : "text-foreground"}`}
								>
									{job.failedMessages}
								</span>
							</GuildDetail>
						</dl>

						{(beforeDeletion || preview) && (
							<div className="mt-5 space-y-4 border-t border-border pt-4">
								<p className="text-sm text-muted-foreground">
									{job.status === "previewing"
										? "Preparing the preview. No messages have been deleted."
										: preview
											? beforeDeletion
												? "Review these messages before confirming deletion."
												: "Message deletion results update live."
											: "The preview will be prepared here. No messages have been deleted."}
								</p>
								{preview && (
									<Card hoverable={false} className="min-w-0 border-border">
										<Card.Content className="space-y-4 p-4">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<h3 className="font-semibold">
													{beforeDeletion ? "Message preview" : "Message results"}
												</h3>
												<Tag variant="secondary" size="sm">
													{preview.deleteCount} message{preview.deleteCount === 1 ? "" : "s"}{" "}
													loaded
												</Tag>
											</div>
											{preview.skippedChannelCount > 0 && (
												<WarningBanner>
													<div className="flex w-full items-center justify-between gap-3">
														<span>
															{preview.skippedChannelCount} channel
															{preview.skippedChannelCount === 1 ? " was" : "s were"}{" "}
															skipped due to missing permissions.
														</span>
														<PillLink
															href={`/guild/${encodeURIComponent(job.guildId)}#guild-channels`}
															variant="outline-secondary"
															size="sm"
															className="shrink-0 whitespace-nowrap"
															target="_blank"
															rel="noreferrer"
														>
															Review
														</PillLink>
													</div>
												</WarningBanner>
											)}
											{preview.messages.length > 0 ? (
												<PurgeMessageList
													guildId={job.guildId}
													messages={preview.messages}
													messageStatuses={job.messageStatuses}
													showStatuses={!beforeDeletion}
													expandedChannelId={expandedChannelId}
													onToggleChannel={(channelId) =>
														setExpandedChannelId(
															expandedChannelId === channelId ? null : channelId,
														)
													}
												/>
											) : (
												<p className="text-sm text-muted-foreground">
													No messages match this request.
												</p>
											)}
											{preview.matchedCount > preview.deleteCount && (
												<p className="text-xs text-muted-foreground">
													Only the newest {preview.deleteCount} of {preview.matchedCount}{" "}
													matches will be deleted.
												</p>
											)}
											{beforeDeletion &&
												(previewExpired ? (
													<WarningBanner>
														This preview expired. Refresh it before confirming.
													</WarningBanner>
												) : (
													<p className="text-xs text-muted-foreground">
														Preview expires {DateHandler.getDateTime(preview.expiresAt)}.
													</p>
												))}
											{beforeDeletion && preview.deleteCount > 0 && (
												<label className="flex items-start gap-2 text-sm">
													<input
														type="checkbox"
														checked={confirmationPreviewId === preview.previewId}
														onChange={(event) =>
															setConfirmationPreviewId(
																event.target.checked ? preview.previewId : null,
															)
														}
														disabled={actionBusy || previewExpired}
														className="mt-1 size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
													/>
													<span>
														I reviewed the preview and understand that {preview.deleteCount}{" "}
														message
														{preview.deleteCount === 1 ? "" : "s"} will be permanently
														deleted.
													</span>
												</label>
											)}
										</Card.Content>
									</Card>
								)}
								{beforeDeletion && (
									<div className="flex flex-wrap items-center gap-3">
										{preview && preview.deleteCount > 0 && (
											<Button
												variant="destructive"
												disabled={
													confirmationPreviewId !== preview.previewId ||
													actionBusy ||
													previewExpired
												}
												onClick={() => confirmMutation.mutate()}
											>
												{confirmMutation.isPending
													? "Starting deletion..."
													: `Delete ${preview.deleteCount} message${preview.deleteCount === 1 ? "" : "s"}`}
											</Button>
										)}
										{job.status !== "previewing" && (
											<Button
												variant="outline-primary"
												disabled={actionBusy}
												onClick={() => {
													confirmMutation.reset();
													prepareMutation.mutate();
												}}
											>
												{prepareMutation.isPending
													? "Preparing preview..."
													: preview
														? "Refresh preview"
														: "Prepare preview"}
											</Button>
										)}
										<Button
											variant="outline-secondary"
											disabled={actionBusy}
											onClick={() => cancelMutation.mutate()}
										>
											Cancel job
										</Button>
									</div>
								)}
							</div>
						)}

						{job.timeLimitReached && (
							<div className="mt-4">
								<WarningBanner>
									The time limit was reached. {job.unprocessedMessages.toLocaleString()} messages
									remain.
								</WarningBanner>
							</div>
						)}
						{job.error && (
							<p
								role="alert"
								className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
							>
								{job.error}
							</p>
						)}
						{job.errors.length > 0 && (
							<div
								role="status"
								className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
							>
								<p className="font-medium text-destructive">Some messages could not be deleted:</p>
								<ul className="mt-1 list-inside list-disc text-muted-foreground">
									{job.errors.map((error) => (
										<li key={error}>{error}</li>
									))}
								</ul>
							</div>
						)}
					</Card>
				</TabsPanel>
			</Tabs>
		</main>
	);
}
