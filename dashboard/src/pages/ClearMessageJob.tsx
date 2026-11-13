import { Button, Card, DateHandler, PillLink, Tag } from "@febkosq8/arc";
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
	FiSliders,
} from "react-icons/fi";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import GuildPageHeader from "@jappan/components/display/GuildPageHeader";
import UserDisplay from "@jappan/components/display/UserDisplay";
import GuildDetail from "@jappan/components/panel/GuildDetail";
import APIHandler, { type ClearMessageJobState } from "@jappan/handlers/APIHandler";
import useClearMessageJobWebsocket from "@jappan/handlers/useClearMessageJobWebsocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const queryKey = (jobId: string) => ["clear-message-job", jobId] as const;

function jobVariant(job: ClearMessageJobState): "destructive" | "warning" | "success" {
	if (job.status === "failed" || job.failedMessages > 0) return "destructive";
	if (
		!["complete", "failed", "cancelled"].includes(job.status) ||
		job.unprocessedMessages > 0 ||
		job.errors.length > 0
	)
		return "warning";
	return "success";
}

function jobLabel(job: ClearMessageJobState): string {
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

function latestState(current: ClearMessageJobState | undefined, incoming: ClearMessageJobState): ClearMessageJobState {
	return current &&
		(current.version > incoming.version ||
			(current.version === incoming.version && current.serverTimestampMs > incoming.serverTimestampMs))
		? current
		: incoming;
}

function WarningBanner({ children }: { children: ReactNode }) {
	return (
		<Card hoverable={false} className="rounded-md border-warning">
			<Card.Content role="status" className="flex items-center justify-start gap-3 p-0! text-left text-sm">
				<FiAlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
				<span>{children}</span>
			</Card.Content>
		</Card>
	);
}

export default function ClearMessageJob() {
	const { jobId = "" } = useParams();
	const queryClient = useQueryClient();
	const [accessProblem, setAccessProblem] = useState(false);
	const [monotonicNow, setMonotonicNow] = useState(() => performance.now());
	const [confirmationPreviewId, setConfirmationPreviewId] = useState<string | null>(null);
	const attemptedPreview = useRef("");
	const attemptedClockRefresh = useRef("");
	const updateState = (state: ClearMessageJobState) =>
		queryClient.setQueryData<ClearMessageJobState>(queryKey(jobId), (current) => latestState(current, state));
	const isValidJobId = jobIdPattern.test(jobId);
	const jobQuery = useQuery({
		queryKey: queryKey(jobId),
		queryFn: async () => {
			const state = await APIHandler.getClearMessageJob(jobId);
			return latestState(queryClient.getQueryData<ClearMessageJobState>(queryKey(jobId)), state);
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
			const promise = APIHandler.prepareClearMessageJob(jobId);
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
				return APIHandler.confirmClearMessageJob(jobId, preview.previewId);
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
			const promise = APIHandler.cancelClearMessageJob(jobId);
			toast.promise(promise, {
				loading: "Cancelling clear job…",
				success: "Clear job cancelled.",
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
	const websocket = useClearMessageJobWebsocket({
		jobId,
		enabled: jobQuery.isSuccess,
		onState: updateState,
		onAccessProblem: () => setAccessProblem(true),
	});

	useDocumentTitle(formatTitle(jobQuery.data ? `Clear job: ${jobQuery.data.guildName}` : "Clear job"));

	if (!isValidJobId || accessProblem || jobQuery.isError || clockUnavailable) {
		const status = axios.isAxiosError(jobQuery.error) ? jobQuery.error.response?.status : undefined;
		const notFound = !isValidJobId || status === 400 || status === 404;
		const denied = status === 403;
		const title = notFound ? "No clear job found" : denied ? "You can't view this job" : "Clear job unavailable";
		const message = clockUnavailable
			? "This job did not return a valid server time. Reload its latest state."
			: accessProblem
				? "This job is no longer available or you no longer have permission to view it."
				: denied
					? "You do not have permission to view this message clear job."
					: "Could not load message clear progress.";
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
							Start a new job from your guild or use /clear.
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
				<LoadingIndicator label="Loading message clear job" />
			</main>
		);
	}

	const job = jobQuery.data;
	const now = job.serverTimestampMs + Math.max(0, monotonicNow - receivedAt);
	const beforeDeletion = ["awaiting_preview", "previewing", "awaiting_confirmation"].includes(job.status);
	const preview = job.status === "awaiting_confirmation" ? job.preview : null;
	const previewExpired = Boolean(preview && preview.expiresAt <= now);
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
				title="Message clear job"
				guild={{ id: job.guildId, name: job.guildName, icon: job.guildIcon }}
			/>

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
						<GuildDetail label="Messages scanned">{job.scannedMessages.toLocaleString()}</GuildDetail>
						<GuildDetail label="Matches found">{job.matchedMessages.toLocaleString()}</GuildDetail>
						<GuildDetail label="Started">{DateHandler.getDateTime(job.startedAtMs)}</GuildDetail>
						{job.finishedAtMs !== null && (
							<GuildDetail label="Finished">{DateHandler.getDateTime(job.finishedAtMs)}</GuildDetail>
						)}
						<GuildDetail label="Time spent">
							<span className="tabular-nums">
								{DateHandler.formatDuration(
									Math.max(0, Math.floor(((job.finishedAtMs ?? now) - job.startedAtMs) / 1000)),
								)}
							</span>
						</GuildDetail>
					</dl>
				</Card>
				<Card hoverable={false} className="min-w-0 p-5 sm:p-6 md:col-span-2">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="flex items-center gap-2 text-lg font-semibold">
							<FiActivity className="size-5 text-primary" aria-hidden="true" />
							Job progress
						</h2>
						<Tag variant={jobVariant(job)} size="sm" className="gap-1.5">
							<StatusIcon aria-hidden="true" />
							{jobLabel(job)}
						</Tag>
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
							<p role="status">
								{websocket.status === "connected"
									? "Live updates connected"
									: "Reconnecting to live updates…"}
							</p>
						</div>
					)}

					{beforeDeletion && (
						<div className="mt-5 space-y-4 border-t border-border pt-4">
							<p className="text-sm text-muted-foreground">
								{job.status === "previewing"
									? "Preparing the preview. No messages have been deleted."
									: preview
										? "Review these messages before confirming deletion."
										: "The preview will be prepared here. No messages have been deleted."}
							</p>
							{preview && (
								<Card hoverable={false} className="min-w-0 border-border">
									<Card.Content className="space-y-4 p-4">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<h3 className="font-semibold">Message preview</h3>
											<Tag variant="secondary" size="sm">
												{preview.deleteCount} selected
											</Tag>
										</div>
										{preview.scanStoppedAtLimit && (
											<WarningBanner>
												Scanning stopped after finding {preview.deleteCount} eligible messages.
												Older matching messages may not be included.
											</WarningBanner>
										)}
										{preview.skippedChannelCount > 0 && (
											<WarningBanner>
												{preview.skippedChannelCount} channel
												{preview.skippedChannelCount === 1 ? " was" : "s were"} skipped due to
												missing permissions.
											</WarningBanner>
										)}
										{preview.olderThanBulkDeleteLimit > 0 && (
											<WarningBanner>
												{preview.olderThanBulkDeleteLimit} message
												{preview.olderThanBulkDeleteLimit === 1 ? " is" : "s are"} older than 14
												days and will be deleted individually.
											</WarningBanner>
										)}
										{preview.messages.length > 0 ? (
											<ul className="max-h-96 space-y-2 overflow-y-auto">
												{preview.messages.map((message) => (
													<li
														key={message.id}
														className="rounded-md border border-border p-3"
													>
														<div className="grid grid-cols-2 items-center gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_minmax(0,1fr)]">
															<ChannelDisplay
																guildId={job.guildId}
																id={message.channelId}
																name={`#${message.channelName}`}
																showId
															/>
															<a
																href={message.jumpUrl}
																target="_blank"
																rel="noreferrer"
																className="min-w-0 justify-self-center break-all text-center text-muted-foreground underline hover:text-primary"
															>
																Message ID: {message.id}
															</a>
															<a
																href={message.jumpUrl}
																target="_blank"
																rel="noreferrer"
																className="justify-self-center whitespace-nowrap text-center text-muted-foreground underline hover:text-primary"
															>
																{DateHandler.getDateTime(message.createdTimestampMs)}
															</a>
															<div className="flex min-w-0 justify-end">
																<UserDisplay
																	id={message.author.id}
																	name={`${message.author.displayName} (@${message.author.username})`}
																	avatarUrl={message.author.avatarUrl}
																	size="sm"
																	showId
																/>
															</div>
														</div>
														<p className="mt-2 wrap-break-word whitespace-pre-wrap text-sm">
															{message.content}
														</p>
													</li>
												))}
											</ul>
										) : (
											<p className="text-sm text-muted-foreground">
												No messages match this request.
											</p>
										)}
										{preview.matchedCount > preview.deleteCount && (
											<p className="text-xs text-muted-foreground">
												Only the newest {preview.deleteCount} of {preview.matchedCount} matches
												will be deleted.
											</p>
										)}
										{previewExpired ? (
											<WarningBanner>
												This preview expired. Refresh it before confirming.
											</WarningBanner>
										) : (
											<p className="text-xs text-muted-foreground">
												Preview expires {DateHandler.getDateTime(preview.expiresAt)}.
											</p>
										)}
										{preview.deleteCount > 0 && (
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
													{preview.deleteCount === 1 ? "" : "s"} will be permanently deleted.
												</span>
											</label>
										)}
									</Card.Content>
								</Card>
							)}
							<div className="flex flex-wrap items-center gap-3">
								{preview && preview.deleteCount > 0 && (
									<Button
										variant="destructive"
										disabled={
											confirmationPreviewId !== preview.previewId || actionBusy || previewExpired
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
							aria-label={beforeDeletion ? "Message preview progress" : "Message clear progress"}
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
								: `${job.messagesProcessed.toLocaleString()} of ${job.messagesToDelete.toLocaleString()} selected messages processed`}
						</p>
					</div>

					<dl className="mt-4 grid gap-3 sm:grid-cols-3">
						<GuildDetail label={beforeDeletion || job.status === "running" ? "Pending" : "Remaining"}>
							<span
								className={`text-2xl font-bold tabular-nums ${job.unprocessedMessages > 0 ? "text-warning" : "text-foreground"}`}
							>
								{job.unprocessedMessages.toLocaleString()}
							</span>
						</GuildDetail>
						<GuildDetail label="Failed">
							<span
								className={`text-2xl font-bold tabular-nums ${job.failedMessages > 0 ? "text-destructive" : "text-foreground"}`}
							>
								{job.failedMessages.toLocaleString()}
							</span>
						</GuildDetail>
						<GuildDetail label="Deleted">
							<span className="text-2xl font-bold tabular-nums text-success">
								{job.deletedMessages.toLocaleString()}
							</span>
						</GuildDetail>
					</dl>

					{job.timeLimitReached && (
						<div className="mt-4">
							<WarningBanner>
								The time limit was reached. {job.unprocessedMessages.toLocaleString()} messages remain.
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
			</div>
		</main>
	);
}
