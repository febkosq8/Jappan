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

export async function deleteMessages({
	channel,
	messages,
	deadlineAt,
	onProgress,
}: {
	channel: object;
	messages: Message[];
	deadlineAt: number;
	onProgress?: (progress: DeleteMessagesProgress) => void;
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
		try {
			await message.delete();
			deleted += 1;
		} catch (error: unknown) {
			failed += 1;
			failures.push({
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
			});
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
				try {
					const deletedMessages = await channel.bulkDelete(batch, true);
					deleted += deletedMessages.size;
					const deletedIds = new Set(deletedMessages.keys());
					for (const message of batch) {
						if (!deletedIds.has(message.id)) {
							failed += 1;
							failures.push({
								messageId: message.id,
								error: "Message was not deleted by the bulk request.",
							});
						}
					}
				} catch (error: unknown) {
					failed += batch.length;
					const errorMessage = error instanceof Error ? error.message : String(error);
					failures.push(...batch.map((message) => ({ messageId: message.id, error: errorMessage })));
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
