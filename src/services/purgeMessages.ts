import type { Message } from "discord.js";

const bulkDeleteBatchSize = 100;

export interface DeleteMessagesFailure {
	messageId: string;
	error: string;
}

export interface DeleteMessagesProgress {
	deleted: number;
	failed: number;
	processed: number;
	total: number;
}

export type DeleteMessageStatus = "pending" | "deleting" | "deleted" | "failed";

export async function deleteMessages({
	channel,
	messages,
	deadlineAt,
	onProgress,
	onMessageStatus,
}: {
	channel: object;
	messages: Message[];
	deadlineAt: number;
	onProgress?: (progress: DeleteMessagesProgress) => void;
	onMessageStatus?: (updates: { messageId: string; status: DeleteMessageStatus }[]) => void;
}) {
	let deleted = 0;
	let failed = 0;
	let timeLimitReached = false;
	const failures: DeleteMessagesFailure[] = [];
	const bulkDeletableBefore = Date.now() - 1209600000;
	const bulkMessages = messages.filter((message) => message.createdTimestamp >= bulkDeletableBefore);
	const individualMessages = messages.filter((message) => message.createdTimestamp < bulkDeletableBefore);
	const reportProgress = () => {
		onProgress?.({ deleted, failed, processed: deleted + failed, total: messages.length });
	};
	const deleteIndividually = async (message: Message) => {
		onMessageStatus?.([{ messageId: message.id, status: "deleting" }]);
		try {
			await message.delete();
			deleted += 1;
			onMessageStatus?.([{ messageId: message.id, status: "deleted" }]);
		} catch (error: unknown) {
			failed += 1;
			failures.push({
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
			});
			onMessageStatus?.([{ messageId: message.id, status: "failed" }]);
		}
		reportProgress();
	};

	if (bulkMessages.length > 0 && "bulkDelete" in channel && typeof channel.bulkDelete === "function") {
		for (let start = 0; start < bulkMessages.length; start += bulkDeleteBatchSize) {
			if (Date.now() >= deadlineAt) {
				timeLimitReached = true;
				break;
			}
			const batch = bulkMessages.slice(start, start + bulkDeleteBatchSize);
			if (batch.length === 1) {
				await deleteIndividually(batch[0]!);
			} else {
				onMessageStatus?.(batch.map((message) => ({ messageId: message.id, status: "deleting" })));
				try {
					const deletedMessages = await channel.bulkDelete(batch, true);
					deleted += deletedMessages.size;
					const deletedIds = new Set(deletedMessages.keys());
					const statusUpdates: { messageId: string; status: DeleteMessageStatus }[] = [];
					for (const message of batch) {
						if (deletedIds.has(message.id)) {
							statusUpdates.push({ messageId: message.id, status: "deleted" });
						} else {
							failed += 1;
							failures.push({
								messageId: message.id,
								error: "Message was not deleted by the bulk request.",
							});
							statusUpdates.push({ messageId: message.id, status: "failed" });
						}
					}
					onMessageStatus?.(statusUpdates);
				} catch (error: unknown) {
					failed += batch.length;
					const errorMessage = error instanceof Error ? error.message : String(error);
					failures.push(...batch.map((message) => ({ messageId: message.id, error: errorMessage })));
					onMessageStatus?.(batch.map((message) => ({ messageId: message.id, status: "failed" })));
				}
				reportProgress();
			}
		}
	} else {
		individualMessages.push(...bulkMessages);
	}

	for (const message of individualMessages) {
		if (Date.now() >= deadlineAt) {
			timeLimitReached = true;
			break;
		}
		await deleteIndividually(message);
	}

	return {
		deleted,
		failed,
		failures,
		unprocessed: messages.length - deleted - failed,
		timeLimitReached: timeLimitReached || Date.now() >= deadlineAt,
	};
}
