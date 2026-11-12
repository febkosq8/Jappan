import { Button, Card, DateHandler, PillLink, Tag } from "@febkosq8/arc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FiActivity, FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiHash } from "react-icons/fi";

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
	if (job.status === "running" || job.status === "stopped" || job.unprocessedMessages > 0 || job.errors.length > 0)
		return "warning";
	return "success";
}

function jobLabel(job: ClearMessageJobState): string {
	if (job.status === "running") return "In progress";
	if (job.status === "failed") return "Failed";
	if (job.status === "stopped") return "Stopped";
	if (job.failedMessages > 0 || job.unprocessedMessages > 0 || job.errors.length > 0) return "Partial results";
	return "Complete";
}

export default function ClearMessageJob() {
	const { jobId = "" } = useParams();
	const queryClient = useQueryClient();
	const [accessProblem, setAccessProblem] = useState(false);
	const isValidJobId = jobIdPattern.test(jobId);
	const jobQuery = useQuery({
		queryKey: queryKey(jobId),
		queryFn: () => APIHandler.getClearMessageJob(jobId),
		enabled: isValidJobId,
		retry: false,
	});

	useEffect(() => setAccessProblem(false), [jobId]);
	const websocket = useClearMessageJobWebsocket({
		jobId,
		enabled: jobQuery.isSuccess,
		onState: (state) => queryClient.setQueryData(queryKey(jobId), state),
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
	const StatusIcon =
		job.status === "running"
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

			<div className="grid items-start gap-4 lg:grid-cols-3">
				<Card hoverable={false} className="min-w-0 p-5 sm:p-6 lg:col-span-2">
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

					<div className="mt-5 rounded-md border border-border bg-muted/30 p-4">
						<div className="flex items-end justify-between gap-3">
							<div>
								<p className="text-sm text-muted-foreground">Overall progress</p>
								<p className="mt-1 text-3xl font-bold tabular-nums text-primary">
									{job.progressPercentage}%
								</p>
							</div>
							<p className="text-right text-sm text-muted-foreground">
								<span className="font-medium tabular-nums text-foreground">
									{job.completedChannels} / {job.channelCount}
								</span>{" "}
								channels completed
							</p>
						</div>
						<div
							role="progressbar"
							aria-label="Message clear progress"
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
							{job.messagesProcessed.toLocaleString()} of {job.messagesToDelete.toLocaleString()} selected
							messages processed
						</p>
					</div>

					<dl className="mt-4 grid gap-3 sm:grid-cols-3">
						<GuildDetail label="Deleted">
							<span className="text-2xl font-bold tabular-nums text-success">
								{job.deletedMessages.toLocaleString()}
							</span>
						</GuildDetail>
						<GuildDetail label="Failed">
							<span
								className={`text-2xl font-bold tabular-nums ${job.failedMessages > 0 ? "text-destructive" : "text-foreground"}`}
							>
								{job.failedMessages.toLocaleString()}
							</span>
						</GuildDetail>
						<GuildDetail label="Not processed">
							<span
								className={`text-2xl font-bold tabular-nums ${job.unprocessedMessages > 0 ? "text-warning" : "text-foreground"}`}
							>
								{job.unprocessedMessages.toLocaleString()}
							</span>
						</GuildDetail>
					</dl>

					<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
						<p className="flex min-w-0 items-center gap-2">
							<FiHash className="shrink-0 text-muted-foreground" aria-hidden="true" />
							<span className="wrap-break-word">{job.currentChannelName ?? job.channelName}</span>
						</p>
						{job.status === "running" && (
							<p role="status" className="text-muted-foreground">
								{websocket.status === "connected"
									? "Live updates connected"
									: "Reconnecting to live updates…"}
							</p>
						)}
					</div>
					{job.timeLimitReached && (
						<p
							role="status"
							className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
						>
							The time limit was reached. {job.unprocessedMessages.toLocaleString()} messages were not
							processed.
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

				<Card hoverable={false} className="min-w-0 p-5 sm:p-6">
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<FiClock className="size-5 text-primary" aria-hidden="true" />
						Job details
					</h2>
					<dl className="mt-5 grid gap-3">
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
					<dl className="mt-4 grid gap-3 border-t border-border pt-4">
						<GuildDetail label="Messages scanned">{job.scannedMessages.toLocaleString()}</GuildDetail>
						<GuildDetail label="Matches found">{job.matchedMessages.toLocaleString()}</GuildDetail>
						<GuildDetail label="Started">{DateHandler.getDateTime(job.startedAtMs)}</GuildDetail>
						{job.finishedAtMs !== null && (
							<GuildDetail label="Finished">{DateHandler.getDateTime(job.finishedAtMs)}</GuildDetail>
						)}
					</dl>
				</Card>
			</div>
		</main>
	);
}
