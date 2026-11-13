import { randomUUID } from "node:crypto";
import type { Collection, Guild, Message, NonThreadGuildBasedChannel } from "discord.js";
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";

import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../helpers/interaction.js";
import { getClientGuild } from "../helpers/guild.js";
import { deleteMessages } from "./purgeMessages.js";
import { logger } from "./logger.js";
import { createPurgeMessageTextFilter } from "./purgeMessageTextFilter.js";
import {
	createPurgeMessagePreview,
	getPurgeChannelPermissionError,
	isPurgeableGuildChannel,
	type PurgeMessagePreview,
	type PurgeMessagePreviewRecord,
} from "./purgeMessagePreviews.js";

export type PurgeableGuildChannel = NonThreadGuildBasedChannel & {
	messages: {
		fetch(options: { limit: number; before?: string }): Promise<Collection<string, Message>>;
	};
};

export interface PurgeMessageJobState {
	jobId: string;
	version: number;
	guildId: string;
	guildName: string;
	guildIcon: string | null;
	channelName: string;
	selectedChannelId: string | null;
	targetUserId: string | null;
	textFilter: string | null;
	regex: boolean;
	ignoreCase: boolean;
	status:
		| "awaiting_preview"
		| "previewing"
		| "awaiting_confirmation"
		| "running"
		| "complete"
		| "stopped"
		| "failed"
		| "cancelled";
	preview: PurgeMessagePreview | null;
	startedAtMs: number;
	requestExpiresAtMs: number;
	finishedAtMs: number | null;
	serverTimestampMs: number;
	messageLimit: number;
	channelCount: number;
	completedChannels: number;
	currentChannelId: string | null;
	currentChannelName: string | null;
	scannedMessages: number;
	matchedMessages: number;
	messagesToDelete: number;
	messagesProcessed: number;
	deletedMessages: number;
	failedMessages: number;
	unprocessedMessages: number;
	progressPercentage: number;
	timeLimitReached: boolean;
	errors: string[];
	error?: string;
}

interface PurgeMessageJobRecord {
	state: PurgeMessageJobState;
	creatorDiscordId: string;
	authorizationChannelIds: string[];
	createdAtMs: number;
	options: CreatePurgeMessageJobOptions;
	preview: PurgeMessagePreviewRecord | null;
	waitingDeadlineAt: number;
	expiryTimer: NodeJS.Timeout | null;
	previewAbortController: AbortController | null;
}

export interface CreatePurgeMessageJobOptions {
	guild: Guild;
	channels: PurgeableGuildChannel[];
	creatorDiscordId: string;
	count: number;
	selectedChannelId?: string;
	targetUserId?: string;
	text?: string;
	regex?: boolean;
	ignoreCase?: boolean;
	excludedInteractionId?: string;
}

export class PurgeMessageJobActionError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export function isPurgeMessageJobTerminal(status: PurgeMessageJobState["status"]): boolean {
	return ["complete", "stopped", "failed", "cancelled"].includes(status);
}

type JobStateListener = (state: PurgeMessageJobState) => void;

const jobs = new Map<string, PurgeMessageJobRecord>();
const listeners = new Set<JobStateListener>();
const jobLifetimeMs = 60 * 60 * 1000;
const requestLifetimeMs = 15 * 60 * 1000;

function pruneJobs() {
	const now = Date.now();
	for (const [jobId, job] of jobs) {
		if (
			!isPurgeMessageJobTerminal(job.state.status) &&
			job.state.status !== "running" &&
			job.waitingDeadlineAt <= now
		) {
			expireRequest(job);
		}
		if (isPurgeMessageJobTerminal(job.state.status) && job.createdAtMs + jobLifetimeMs <= now) {
			jobs.delete(jobId);
		}
	}
}

function calculateProgress(state: PurgeMessageJobState, currentChannelTotal: number, currentChannelProcessed: number) {
	if (state.channelCount === 0) return 100;
	const channelProgress = currentChannelTotal > 0 ? Math.min(1, currentChannelProcessed / currentChannelTotal) : 0;
	return Math.min(100, Math.round(((state.completedChannels + channelProgress) / state.channelCount) * 100));
}

function snapshot(record: PurgeMessageJobRecord): PurgeMessageJobState {
	return { ...structuredClone(record.state), serverTimestampMs: Date.now() };
}

function publish(record: PurgeMessageJobRecord) {
	record.state.version += 1;
	const state = snapshot(record);
	for (const listener of listeners) {
		try {
			listener(state);
		} catch (error: unknown) {
			logger.error("WEBSOCKET", "Failed to publish purge job progress", {
				jobId: state.jobId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function addJobError(record: PurgeMessageJobRecord, error: string) {
	if (!record.state.errors.includes(error)) {
		record.state.errors.push(error);
	}
}

function finishChannel({ record }: { record: PurgeMessageJobRecord }) {
	record.state.messagesProcessed = record.state.deletedMessages + record.state.failedMessages;
	record.state.unprocessedMessages = Math.max(0, record.state.messagesToDelete - record.state.messagesProcessed);
	record.state.completedChannels += 1;
	record.state.currentChannelId = null;
	record.state.currentChannelName = null;
	record.state.progressPercentage = calculateProgress(record.state, 0, 0);
	publish(record);
}

async function runPurgeMessageJob(
	record: PurgeMessageJobRecord,
	{
		channels,
		messages: previewMessages,
		validateChannel,
	}: {
		channels: PurgeableGuildChannel[];
		messages: Message[];
		validateChannel: (channel: PurgeableGuildChannel) => string | null;
	},
) {
	const deadlineAt = Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS;
	let messagesDeleted = 0;
	try {
		for (const channel of channels) {
			if (Date.now() >= deadlineAt) {
				record.state.timeLimitReached = true;
				break;
			}
			if (messagesDeleted >= record.state.messageLimit) break;

			record.state.currentChannelId = channel.id;
			record.state.currentChannelName = channel.name;
			record.state.progressPercentage = calculateProgress(record.state, 0, 0);
			publish(record);

			const permissionError = validateChannel(channel);
			if (permissionError) {
				addJobError(record, `${channel.name}: ${permissionError}`);
				finishChannel({ record });
				continue;
			}

			const messages = previewMessages
				.filter((message) => message.channelId === channel.id)
				.slice(0, Math.max(0, record.state.messageLimit - messagesDeleted));
			record.state.progressPercentage = calculateProgress(record.state, messages.length, 0);
			publish(record);
			if (messages.length === 0) {
				finishChannel({ record });
				continue;
			}

			const deletedBeforeChannel = record.state.deletedMessages;
			const failedBeforeChannel = record.state.failedMessages;
			const result = await deleteMessages({
				channel,
				messages,
				deadlineAt,
				onProgress: (progress) => {
					record.state.deletedMessages = deletedBeforeChannel + progress.deleted;
					record.state.failedMessages = failedBeforeChannel + progress.failed;
					record.state.messagesProcessed = record.state.deletedMessages + record.state.failedMessages;
					record.state.unprocessedMessages = Math.max(
						0,
						record.state.messagesToDelete - record.state.messagesProcessed,
					);
					record.state.progressPercentage = calculateProgress(
						record.state,
						messages.length,
						progress.processed,
					);
					publish(record);
				},
			});
			record.state.deletedMessages = deletedBeforeChannel + result.deleted;
			record.state.failedMessages = failedBeforeChannel + result.failed;
			messagesDeleted += result.deleted;
			for (const failure of result.failures) addJobError(record, failure.error);
			record.state.timeLimitReached ||= result.timeLimitReached;
			finishChannel({ record });
			if (record.state.timeLimitReached) break;
		}

		record.state.unprocessedMessages = Math.max(0, record.state.messagesToDelete - record.state.messagesProcessed);
		record.state.status = record.state.timeLimitReached ? "stopped" : "complete";
		record.state.finishedAtMs = Date.now();
		if (record.expiryTimer) clearTimeout(record.expiryTimer);
		record.state.currentChannelId = null;
		record.state.currentChannelName = null;
		record.state.progressPercentage = record.state.status === "complete" ? 100 : record.state.progressPercentage;
		publish(record);
		logger.info("HTTP", "Message purge job finished", {
			jobId: record.state.jobId,
			guildId: record.state.guildId,
			deleted: record.state.deletedMessages,
			failed: record.state.failedMessages,
			unprocessed: record.state.unprocessedMessages,
		});
	} catch (error: unknown) {
		record.state.status = "failed";
		record.state.error = error instanceof Error ? error.message : String(error);
		record.state.finishedAtMs = Date.now();
		if (record.expiryTimer) clearTimeout(record.expiryTimer);
		record.state.currentChannelId = null;
		record.state.currentChannelName = null;
		addJobError(record, record.state.error);
		publish(record);
		logger.error("HTTP", "Message purge job failed", {
			jobId: record.state.jobId,
			guildId: record.state.guildId,
			error: record.state.error,
		});
	}
}

export function createPurgeMessageJob(options: CreatePurgeMessageJobOptions): PurgeMessageJobState {
	if (!Number.isInteger(options.count) || options.count < 1 || options.count > 200) {
		throw new PurgeMessageJobActionError(400, "Count must be between 1 and 200.");
	}
	if (options.channels.length === 0) {
		throw new PurgeMessageJobActionError(403, "No message channels are available with the required permissions");
	}
	const textFilter = createPurgeMessageTextFilter(options);
	pruneJobs();
	const existingJob = [...jobs.values()].find(
		(job) => job.state.guildId === options.guild.id && !isPurgeMessageJobTerminal(job.state.status),
	);
	if (existingJob) {
		throw new PurgeMessageJobActionError(
			409,
			"A purge job is already active or pending for this guild. Wait for it to finish or expire before starting another.",
		);
	}
	const jobId = randomUUID();
	const startedAtMs = Date.now();
	const requestExpiresAtMs = startedAtMs + requestLifetimeMs;
	const state: PurgeMessageJobState = {
		jobId,
		version: 0,
		guildId: options.guild.id,
		guildName: options.guild.name,
		guildIcon: options.guild.iconURL(),
		channelName: options.channels.length === 1 ? (options.channels[0]?.name ?? "Selected channel") : "All channels",
		selectedChannelId: options.selectedChannelId ?? null,
		targetUserId: options.targetUserId ?? null,
		textFilter: textFilter.text,
		regex: options.regex ?? false,
		ignoreCase: options.ignoreCase ?? false,
		status: "awaiting_preview",
		preview: null,
		startedAtMs,
		requestExpiresAtMs,
		finishedAtMs: null,
		serverTimestampMs: startedAtMs,
		messageLimit: options.count,
		channelCount: options.channels.length,
		completedChannels: 0,
		currentChannelId: null,
		currentChannelName: null,
		scannedMessages: 0,
		matchedMessages: 0,
		messagesToDelete: 0,
		messagesProcessed: 0,
		deletedMessages: 0,
		failedMessages: 0,
		unprocessedMessages: 0,
		progressPercentage: 0,
		timeLimitReached: false,
		errors: [],
	};
	const record: PurgeMessageJobRecord = {
		state,
		creatorDiscordId: options.creatorDiscordId,
		authorizationChannelIds: options.channels.map((channel) => channel.id),
		createdAtMs: startedAtMs,
		options,
		preview: null,
		waitingDeadlineAt: requestExpiresAtMs,
		expiryTimer: null,
		previewAbortController: null,
	};
	jobs.set(jobId, record);
	record.expiryTimer = setTimeout(
		() => {
			if (!isPurgeMessageJobTerminal(record.state.status) && record.state.status !== "running")
				expireRequest(record);
		},
		Math.max(0, record.waitingDeadlineAt - Date.now()),
	);
	record.expiryTimer.unref();
	logger.info("HTTP", "Message purge request created", {
		jobId,
		guildId: options.guild.id,
		userId: options.creatorDiscordId,
		channelCount: options.channels.length,
	});
	publish(record);
	return snapshot(record);
}

function expireRequest(record: PurgeMessageJobRecord): void {
	record.previewAbortController?.abort();
	record.state.status = "stopped";
	record.state.timeLimitReached = true;
	record.state.error = "This request expired after 15 minutes without confirmation. Create a new job.";
	record.state.finishedAtMs = Date.now();
	record.state.currentChannelId = null;
	record.state.currentChannelName = null;
	record.state.completedChannels = 0;
	record.state.progressPercentage = 0;
	if (record.expiryTimer) clearTimeout(record.expiryTimer);
	publish(record);
}

function getActionRecord(jobId: string): PurgeMessageJobRecord {
	pruneJobs();
	const record = jobs.get(jobId);
	if (!record) throw new PurgeMessageJobActionError(404, "Message purge job not found");
	return record;
}

function requirePhase(record: PurgeMessageJobRecord, phases: PurgeMessageJobState["status"][]): void {
	if (
		!isPurgeMessageJobTerminal(record.state.status) &&
		record.state.status !== "running" &&
		record.waitingDeadlineAt <= Date.now()
	) {
		expireRequest(record);
	}
	if (!phases.includes(record.state.status)) {
		throw new PurgeMessageJobActionError(
			409,
			"This job is no longer in the requested phase. Reload its latest state.",
		);
	}
}

async function resolveJobChannels(record: PurgeMessageJobRecord, isBotAdmin: boolean) {
	const guild = getClientGuild(record.state.guildId);
	if (!guild?.available) throw new PurgeMessageJobActionError(503, "Guild is unavailable");
	const member = await guild.members.fetch(record.creatorDiscordId).catch((error: unknown) => {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null;
		throw error;
	});
	if (!isBotAdmin && !member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
		throw new PurgeMessageJobActionError(403, "Manage Server access to this guild is required");
	}
	const botMember = guild.members.me ?? (await guild.members.fetchMe());
	const validateChannel = (channel: PurgeableGuildChannel) =>
		getPurgeChannelPermissionError({
			channel,
			member,
			botMember,
			isBotAdministrator: isBotAdmin,
		});
	const selectedId = record.state.selectedChannelId;
	const selectedChannel = selectedId
		? await guild.channels.fetch(selectedId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) return null;
				throw error;
			})
		: null;
	if (selectedId && !isPurgeableGuildChannel(selectedChannel)) {
		throw new PurgeMessageJobActionError(404, "Selected message channel is no longer available");
	}
	const candidates = selectedChannel ? [selectedChannel] : [...(await guild.channels.fetch()).values()];
	const channels: PurgeableGuildChannel[] = [];
	let skippedChannelCount = 0;
	for (const channel of candidates) {
		if (!isPurgeableGuildChannel(channel)) continue;
		const error = validateChannel(channel);
		if (error) {
			if (selectedId) throw new PurgeMessageJobActionError(403, error);
			skippedChannelCount += 1;
			continue;
		}
		channels.push(channel);
	}
	if (channels.length === 0) {
		throw new PurgeMessageJobActionError(403, "No message channels are available with the required permissions");
	}
	return { guild, channels, skippedChannelCount, validateChannel };
}

export async function preparePurgeMessageJob({
	jobId,
	isBotAdmin,
}: {
	jobId: string;
	isBotAdmin: boolean;
}): Promise<PurgeMessageJobState> {
	const record = getActionRecord(jobId);
	requirePhase(record, ["awaiting_preview", "awaiting_confirmation"]);
	const context = await resolveJobChannels(record, isBotAdmin);
	requirePhase(record, ["awaiting_preview", "awaiting_confirmation"]);
	record.state.status = "previewing";
	const controller = new AbortController();
	record.previewAbortController = controller;
	record.state.preview = null;
	record.preview = null;
	record.state.channelCount = context.channels.length;
	record.state.completedChannels = 0;
	record.state.progressPercentage = 0;
	record.state.scannedMessages = 0;
	record.state.matchedMessages = 0;
	record.state.messagesToDelete = 0;
	record.state.unprocessedMessages = 0;
	publish(record);
	void (async () => {
		try {
			const preview = await createPurgeMessagePreview({
				guild: context.guild,
				channels: context.channels,
				count: record.state.messageLimit,
				...(record.options.selectedChannelId ? { selectedChannelId: record.options.selectedChannelId } : {}),
				...(record.options.targetUserId ? { targetUserId: record.options.targetUserId } : {}),
				...(record.state.textFilter !== null ? { text: record.state.textFilter } : {}),
				regex: record.state.regex,
				ignoreCase: record.state.ignoreCase,
				...(record.options.excludedInteractionId
					? { excludedInteractionId: record.options.excludedInteractionId }
					: {}),
				jobDeadlineAt: record.waitingDeadlineAt,
				signal: controller.signal,
				skippedChannelCount: context.skippedChannelCount,
				validateChannel: context.validateChannel,
				onProgress: (progress) => {
					if (record.state.status !== "previewing") return;
					record.state.scannedMessages = progress.scannedCount;
					record.state.matchedMessages = progress.matchedCount;
					record.state.completedChannels = progress.scannedChannelCount;
					record.state.currentChannelId = progress.currentChannelId;
					record.state.currentChannelName = progress.currentChannelName;
					record.state.progressPercentage = Math.min(
						99,
						Math.round((progress.scannedChannelCount / context.channels.length) * 100),
					);
					publish(record);
				},
			});
			if (record.state.status !== "previewing") return;
			record.preview = preview;
			record.state.preview = preview.data;
			record.state.scannedMessages = preview.data.scannedCount;
			record.state.matchedMessages = preview.data.matchedCount;
			record.state.messagesToDelete = preview.messages.length;
			record.state.unprocessedMessages = preview.messages.length;
			record.state.currentChannelId = null;
			record.state.currentChannelName = null;
			record.state.status = "awaiting_confirmation";
			record.state.progressPercentage = 100;
			record.authorizationChannelIds =
				preview.messages.length > 0
					? [...new Set(preview.messages.map((message) => message.channelId))]
					: context.channels.map((channel) => channel.id);
			publish(record);
		} catch (error: unknown) {
			if (controller.signal.aborted) {
				logger.info("HTTP", "Purge job preview preparation stopped", { jobId, status: record.state.status });
				return;
			}
			logger.error("HTTP", "Failed to prepare purge job preview", {
				jobId,
				error: error instanceof Error ? error.message : String(error),
			});
			if (record.state.status !== "previewing") return;
			record.state.status = "failed";
			record.state.error = error instanceof Error ? error.message : String(error);
			record.state.finishedAtMs = Date.now();
			record.state.currentChannelId = null;
			record.state.currentChannelName = null;
			record.state.completedChannels = 0;
			record.state.progressPercentage = 0;
			if (record.expiryTimer) clearTimeout(record.expiryTimer);
			publish(record);
		}
	})();
	return snapshot(record);
}

export async function confirmPurgeMessageJob({
	jobId,
	previewId,
	isBotAdmin,
}: {
	jobId: string;
	previewId: string;
	isBotAdmin: boolean;
}): Promise<PurgeMessageJobState> {
	const record = getActionRecord(jobId);
	requirePhase(record, ["awaiting_confirmation"]);
	const preview = record.preview;
	if (!preview || preview.data.previewId !== previewId) {
		throw new PurgeMessageJobActionError(409, "The preview changed. Review the latest preview before confirming.");
	}
	if (preview.data.expiresAt <= Date.now()) {
		throw new PurgeMessageJobActionError(409, "The preview expired. Refresh it before confirming.");
	}
	if (preview.messages.length === 0)
		throw new PurgeMessageJobActionError(409, "This preview has no matching messages");
	const context = await resolveJobChannels(record, isBotAdmin);
	requirePhase(record, ["awaiting_confirmation"]);
	if (record.preview !== preview || preview.data.expiresAt <= Date.now()) {
		throw new PurgeMessageJobActionError(409, "The preview changed or expired. Review a fresh preview.");
	}
	const channelIds = new Set(preview.messages.map((message) => message.channelId));
	const channels = context.channels.filter((channel) => channelIds.has(channel.id));
	if (channels.length !== channelIds.size) {
		throw new PurgeMessageJobActionError(409, "Channel access changed. Refresh the preview before confirming.");
	}
	record.state.status = "running";
	if (record.expiryTimer) clearTimeout(record.expiryTimer);
	record.expiryTimer = null;
	record.state.preview = null;
	record.state.completedChannels = 0;
	record.state.channelCount = channels.length;
	record.state.progressPercentage = 0;
	publish(record);
	void runPurgeMessageJob(record, { channels, messages: preview.messages, validateChannel: context.validateChannel });
	return snapshot(record);
}

export function cancelPurgeMessageJob(jobId: string): PurgeMessageJobState {
	const record = getActionRecord(jobId);
	requirePhase(record, ["awaiting_preview", "previewing", "awaiting_confirmation"]);
	record.state.status = "cancelled";
	record.previewAbortController?.abort();
	record.state.finishedAtMs = Date.now();
	record.state.currentChannelId = null;
	record.state.currentChannelName = null;
	record.state.completedChannels = 0;
	record.state.progressPercentage = 0;
	record.state.preview = null;
	if (record.expiryTimer) clearTimeout(record.expiryTimer);
	publish(record);
	return snapshot(record);
}

export function getPurgeMessageJob(jobId: string): PurgeMessageJobState | null {
	pruneJobs();
	const record = jobs.get(jobId);
	return record ? snapshot(record) : null;
}

export function onPurgeMessageJobState(listener: JobStateListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function authorizePurgeMessageJob({
	jobId,
	discordUserId,
	isBotAdmin,
	requireCreator = false,
}: {
	jobId: string;
	discordUserId: string;
	isBotAdmin: boolean;
	requireCreator?: boolean;
}): Promise<
	| { status: "ok"; job: PurgeMessageJobState }
	| { status: "not_found" }
	| { status: "forbidden" }
	| { status: "unavailable" }
> {
	pruneJobs();
	const record = jobs.get(jobId);
	if (!record) return { status: "not_found" };
	if (
		record.creatorDiscordId !== discordUserId &&
		(requireCreator ||
			(!isBotAdmin && !isPurgeMessageJobTerminal(record.state.status) && record.state.status !== "running"))
	) {
		return { status: "forbidden" };
	}
	const guild = getClientGuild(record.state.guildId);
	if (!guild?.available) return { status: "unavailable" };
	if (!isBotAdmin) {
		const member = await guild.members.fetch(discordUserId).catch((error: unknown) => {
			if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null;
			throw error;
		});
		if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) return { status: "forbidden" };
		for (const channelId of record.authorizationChannelIds) {
			const channel = await guild.channels.fetch(channelId).catch((error: unknown) => {
				if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) return null;
				throw error;
			});
			if (
				!channel ||
				channel.guildId !== guild.id ||
				!("permissionsFor" in channel) ||
				!member
					.permissionsIn(channel)
					.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])
			) {
				return { status: "forbidden" };
			}
		}
	}
	return { status: "ok", job: snapshot(record) };
}
