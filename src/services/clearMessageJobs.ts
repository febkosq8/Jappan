import { randomUUID } from "node:crypto";
import type { Collection, Guild, Message, NonThreadGuildBasedChannel } from "discord.js";
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";

import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../helpers/interaction.js";
import { getClientGuild } from "../helpers/guild.js";
import { deleteMessages } from "./clearMessages.js";
import { logger } from "./logger.js";

export type ClearableGuildChannel = NonThreadGuildBasedChannel & {
	messages: {
		fetch(options: { limit: number }): Promise<Collection<string, Message>>;
	};
};

export interface ClearMessageJobState {
	jobId: string;
	guildId: string;
	guildName: string;
	channelName: string;
	selectedChannelId: string | null;
	targetUserId: string | null;
	textFilter: string | null;
	status: "running" | "complete" | "stopped" | "failed";
	startedAtMs: number;
	finishedAtMs: number | null;
	messageLimit: number;
	channelCount: number;
	completedChannels: number;
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

interface ClearMessageJobRecord {
	state: ClearMessageJobState;
	creatorDiscordId: string;
	authorizationChannelId: string;
	createdAtMs: number;
}

export interface StartClearMessageJobOptions {
	guild: Guild;
	channels: ClearableGuildChannel[];
	creatorDiscordId: string;
	authorizationChannelId: string;
	count: number;
	selectedChannelId?: string;
	targetUserId?: string;
	text?: string;
	excludedInteractionId?: string;
	presetMessages?: Message[];
	presetScannedCount?: number;
	presetMatchedCount?: number;
	validateChannel?: (channel: ClearableGuildChannel) => string | null;
}

type JobStateListener = (state: ClearMessageJobState) => void;

const jobs = new Map<string, ClearMessageJobRecord>();
const listeners = new Set<JobStateListener>();
const jobLifetimeMs = 60 * 60 * 1000;
const scanLimitPerChannel = 100;

function pruneJobs() {
	const now = Date.now();
	for (const [jobId, job] of jobs) {
		if (job.state.status !== "running" && job.createdAtMs + jobLifetimeMs <= now) {
			jobs.delete(jobId);
		}
	}
}

function calculateProgress(state: ClearMessageJobState, currentChannelTotal: number, currentChannelProcessed: number) {
	if (state.channelCount === 0) return 100;
	const channelProgress = currentChannelTotal > 0 ? Math.min(1, currentChannelProcessed / currentChannelTotal) : 0;
	return Math.min(100, Math.round(((state.completedChannels + channelProgress) / state.channelCount) * 100));
}

function snapshot(record: ClearMessageJobRecord): ClearMessageJobState {
	return { ...record.state, errors: [...record.state.errors] };
}

function publish(record: ClearMessageJobRecord) {
	const state = snapshot(record);
	for (const listener of listeners) {
		try {
			listener(state);
		} catch (error: unknown) {
			logger.error("WEBSOCKET", "Failed to publish clear job progress", {
				jobId: state.jobId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function addJobError(record: ClearMessageJobRecord, error: string) {
	if (!record.state.errors.includes(error)) {
		record.state.errors.push(error);
	}
}

function finishChannel({ record }: { record: ClearMessageJobRecord }) {
	record.state.messagesProcessed = record.state.deletedMessages + record.state.failedMessages;
	record.state.unprocessedMessages = Math.max(0, record.state.messagesToDelete - record.state.messagesProcessed);
	record.state.completedChannels += 1;
	record.state.currentChannelName = null;
	record.state.progressPercentage = calculateProgress(record.state, 0, 0);
	publish(record);
}

async function runClearMessageJob(record: ClearMessageJobRecord, options: StartClearMessageJobOptions) {
	const deadlineAt = Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS;
	let presetMessagesUsed = false;
	let messagesDeleted = 0;
	try {
		for (const channel of options.channels) {
			if (Date.now() >= deadlineAt) {
				record.state.timeLimitReached = true;
				break;
			}
			if (messagesDeleted >= options.count) break;

			record.state.currentChannelName = channel.name;
			record.state.progressPercentage = calculateProgress(record.state, 0, 0);
			publish(record);

			const permissionError = options.validateChannel?.(channel) ?? null;
			if (permissionError) {
				addJobError(record, `${channel.name}: ${permissionError}`);
				finishChannel({ record });
				continue;
			}

			let matchingMessages: Message[];
			if (options.presetMessages && !presetMessagesUsed) {
				presetMessagesUsed = true;
				matchingMessages = options.presetMessages;
				record.state.scannedMessages = options.presetScannedCount ?? matchingMessages.length;
				record.state.matchedMessages = options.presetMatchedCount ?? matchingMessages.length;
			} else {
				try {
					const fetchedMessages = await channel.messages.fetch({ limit: scanLimitPerChannel });
					record.state.scannedMessages += fetchedMessages.size;
					matchingMessages = [...fetchedMessages.values()].filter(
						(message) =>
							(!options.targetUserId || message.author.id === options.targetUserId) &&
							(!options.text || message.content.includes(options.text)) &&
							(!options.excludedInteractionId ||
								message.interactionMetadata?.id !== options.excludedInteractionId),
					);
					record.state.matchedMessages += matchingMessages.length;
				} catch (error: unknown) {
					addJobError(record, `${channel.name}: ${error instanceof Error ? error.message : String(error)}`);
					finishChannel({ record });
					continue;
				}
			}

			const messages = matchingMessages.slice(0, Math.max(0, options.count - messagesDeleted));
			if (!options.presetMessages) record.state.messagesToDelete += messages.length;
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
		record.state.currentChannelName = null;
		record.state.progressPercentage = record.state.status === "complete" ? 100 : record.state.progressPercentage;
		publish(record);
		logger.info("HTTP", "Message clear job finished", {
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
		record.state.currentChannelName = null;
		addJobError(record, record.state.error);
		publish(record);
		logger.error("HTTP", "Message clear job failed", {
			jobId: record.state.jobId,
			guildId: record.state.guildId,
			error: record.state.error,
		});
	}
}

export function startClearMessageJob(options: StartClearMessageJobOptions): ClearMessageJobState {
	pruneJobs();
	const jobId = randomUUID();
	const startedAtMs = Date.now();
	const state: ClearMessageJobState = {
		jobId,
		guildId: options.guild.id,
		guildName: options.guild.name,
		channelName: options.channels.length === 1 ? (options.channels[0]?.name ?? "Selected channel") : "All channels",
		selectedChannelId: options.selectedChannelId ?? null,
		targetUserId: options.targetUserId ?? null,
		textFilter: options.text ?? null,
		status: "running",
		startedAtMs,
		finishedAtMs: null,
		messageLimit: options.count,
		channelCount: options.channels.length,
		completedChannels: 0,
		currentChannelName: null,
		scannedMessages: options.presetScannedCount ?? 0,
		matchedMessages: options.presetMatchedCount ?? 0,
		messagesToDelete: options.presetMessages?.length ?? 0,
		messagesProcessed: 0,
		deletedMessages: 0,
		failedMessages: 0,
		unprocessedMessages: options.presetMessages?.length ?? 0,
		progressPercentage: 0,
		timeLimitReached: false,
		errors: [],
	};
	const record: ClearMessageJobRecord = {
		state,
		creatorDiscordId: options.creatorDiscordId,
		authorizationChannelId: options.authorizationChannelId,
		createdAtMs: startedAtMs,
	};
	jobs.set(jobId, record);
	logger.info("HTTP", "Message clear job started", {
		jobId,
		guildId: options.guild.id,
		userId: options.creatorDiscordId,
		channelCount: options.channels.length,
	});
	publish(record);
	void runClearMessageJob(record, options);
	return snapshot(record);
}

export function getClearMessageJob(jobId: string): ClearMessageJobState | null {
	pruneJobs();
	const record = jobs.get(jobId);
	return record ? snapshot(record) : null;
}

export function onClearMessageJobState(listener: JobStateListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function authorizeClearMessageJob({
	jobId,
	discordUserId,
	isBotAdmin,
}: {
	jobId: string;
	discordUserId: string;
	isBotAdmin: boolean;
}): Promise<
	| { status: "ok"; job: ClearMessageJobState }
	| { status: "not_found" }
	| { status: "forbidden" }
	| { status: "unavailable" }
> {
	pruneJobs();
	const record = jobs.get(jobId);
	if (!record) return { status: "not_found" };
	const guild = getClientGuild(record.state.guildId);
	if (!guild?.available) return { status: "unavailable" };
	if (!isBotAdmin) {
		const member = await guild.members.fetch(discordUserId).catch((error: unknown) => {
			if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null;
			throw error;
		});
		if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) return { status: "forbidden" };
		const channel = await guild.channels.fetch(record.authorizationChannelId).catch((error: unknown) => {
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
	return { status: "ok", job: snapshot(record) };
}
