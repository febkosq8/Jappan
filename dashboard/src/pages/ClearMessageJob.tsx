import { Button, Card, DateHandler, PillLink, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { FiActivity, FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiHash, FiSliders } from "react-icons/fi";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildPageHeader from "@jappan/components/display/GuildPageHeader";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
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
	return current && current.version > incoming.version ? current : incoming;
}

export default function ClearMessageJob() {
	const { jobId = "" } = useParams();
	const queryClient = useQueryClient();
	const [accessProblem, setAccessProblem] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [confirmationPreviewId, setConfirmationPreviewId] = useState<string | null>(null);
	const attemptedPreview = useRef("");
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
	const active =
		jobQuery.isSuccess &&
		!["complete", "stopped", "failed", "cancelled"].includes(jobQuery.data.status) &&
		!accessProblem;
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active, jobId]);

	useEffect(() => setAccessProblem(false), [jobId]);
	const prepareMutation = useMutation({
		mutationFn: () => APIHandler.prepareClearMessageJob(jobId),
		onMutate: () => setConfirmationPreviewId(null),
		onSuccess: updateState,
	});
	const confirmMutation = useMutation({
		mutationFn: () => {
			const preview = jobQuery.data?.preview;
			if (!preview || confirmationPreviewId !== preview.previewId)
				throw new Error("Review the current preview first.");
			return APIHandler.confirmClearMessageJob(jobId, preview.previewId);
		},
		onSuccess: updateState,
	});
	const cancelMutation = useMutation({
		mutationFn: () => APIHandler.cancelClearMessageJob(jobId),
		onSuccess: updateState,
	});
	useEffect(() => {
		if (jobQuery.data?.status !== "awaiting_preview" || accessProblem || attemptedPreview.current === jobId) return;
		attemptedPreview.current = jobId;
		prepareMutation.mutate();
	}, [jobQuery.data?.status, jobId, accessProblem, prepareMutation.mutate]);
	const websocket = useClearMessageJobWebsocket({
		jobId,
		enabled: jobQuery.isSuccess,
		onState: updateState,
		onAccessProblem: () => setAccessProblem(true),
	});

	useDocumentTitle(formatTitle(jobQuery.data ? `Clear job: ${jobQuery.data.guildName}` : "Clear job"));

	if (!isValidJobId || accessProblem || jobQuery.isError) {
		const status = axios.isAxiosError(jobQuery.error) ? jobQuery.error.response?.status : undefined;
		const notFound = !isValidJobId || status === 400 || status === 404;
		const denied = status === 403;
		const title = notFound ? "No clear job found" : denied ? "You can't view this job" : "Clear job unavailable";
		const message = accessProblem
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
	if (jobQuery.isPending) {
		return (
			<main className="flex min-h-[calc(100dvh-4.0625rem)] items-center justify-center px-4 py-10">
				<LoadingIndicator label="Loading message clear job" />
			</main>
		);
	}

	const job = jobQuery.data;
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
			<GuildPageHeader title="Message clear job" guild={{ id: job.guildId, name: job.guildName }} />

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
								<ExternalTextLink
									href={`https://discord.com/channels/${encodeURIComponent(job.guildId)}/${encodeURIComponent(job.selectedChannelId)}`}
									text={`#${job.channelName}`}
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
						<GuildDetail label="Text contains (case-sensitive)">
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
							{job.currentChannelName && (
								<p className="flex min-w-0 items-center gap-2">
									<FiHash className="shrink-0" aria-hidden="true" />
									<span className="wrap-break-word">
										{job.status === "previewing" ? "Scanning" : "Processing"} #
										{job.currentChannelName}
									</span>
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
								<>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h3 className="font-semibold">Message preview</h3>
										<Tag variant="secondary" size="sm">
											{preview.deleteCount} selected
										</Tag>
									</div>
									{preview.scanLimitReached && (
										<p className="text-sm text-warning">
											Only the newest 100 messages per channel were scanned.
										</p>
									)}
									{preview.skippedChannelCount > 0 && (
										<p className="text-sm text-warning">
											{preview.skippedChannelCount} channel
											{preview.skippedChannelCount === 1 ? " was" : "s were"} skipped due to
											missing permissions.
										</p>
									)}
									{preview.olderThanBulkDeleteLimit > 0 && (
										<p className="text-sm text-warning">
											{preview.olderThanBulkDeleteLimit} message
											{preview.olderThanBulkDeleteLimit === 1 ? " is" : "s are"} older than 14
											days and will be deleted individually.
										</p>
									)}
									{preview.messages.length > 0 ? (
										<ul className="max-h-96 space-y-2 overflow-y-auto">
											{preview.messages.map((message) => (
												<li key={message.id} className="rounded-md border border-border p-3">
													<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
														<span className="font-medium">
															{!preview.channel && (
																<span className="mr-2 text-muted-foreground">
																	#{message.channelName}
																</span>
															)}
															{message.author.displayName} (@{message.author.username})
														</span>
														<a
															href={message.jumpUrl}
															target="_blank"
															rel="noreferrer"
															className="text-muted-foreground underline hover:text-primary"
														>
															{DateHandler.getDateTime(message.createdTimestampMs)}
														</a>
													</div>
													<p className="mt-2 wrap-break-word whitespace-pre-wrap text-sm">
														{message.content}
													</p>
												</li>
											))}
										</ul>
									) : (
										<p className="text-sm text-muted-foreground">No messages match this request.</p>
									)}
									{preview.matchedCount > preview.deleteCount && (
										<p className="text-xs text-muted-foreground">
											Only the newest {preview.deleteCount} of {preview.matchedCount} matches will
											be deleted.
										</p>
									)}
									{previewExpired ? (
										<p role="alert" className="text-sm text-warning">
											This preview expired. Refresh it before confirming.
										</p>
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
												I reviewed the preview and understand that {preview.deleteCount} message
												{preview.deleteCount === 1 ? "" : "s"} will be permanently deleted.
											</span>
										</label>
									)}
								</>
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
					{[prepareMutation, confirmMutation, cancelMutation].map(
						(mutation, index) =>
							mutation.isError && (
								<p key={index} role="alert" className="mt-3 text-sm text-destructive">
									{actionError(mutation.error)}
								</p>
							),
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
						<p
							role="status"
							className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
						>
							The time limit was reached. {job.unprocessedMessages.toLocaleString()} messages remain.
						</p>
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
