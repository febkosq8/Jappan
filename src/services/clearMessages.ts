import type { Message } from "discord.js";

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

	if (bulkMessages.length > 0 && "bulkDelete" in channel && typeof channel.bulkDelete === "function") {
		if (Date.now() >= deadlineAt) {
			timeLimitReached = true;
		} else {
			try {
				const deletedMessages = await channel.bulkDelete(bulkMessages, true);
				deleted += deletedMessages.size;
				const deletedIds = new Set(deletedMessages.keys());
				for (const message of bulkMessages) {
					if (!deletedIds.has(message.id)) {
						failed += 1;
						failures.push({ messageId: message.id, error: "Message was not deleted by the bulk request." });
					}
				}
			} catch (error: unknown) {
				failed += bulkMessages.length;
				const errorMessage = error instanceof Error ? error.message : String(error);
				failures.push(...bulkMessages.map((message) => ({ messageId: message.id, error: errorMessage })));
			}
			reportProgress();
			timeLimitReached = Date.now() >= deadlineAt;
		}
	} else {
		individualMessages.push(...bulkMessages);
	}

	for (const message of individualMessages) {
		if (Date.now() >= deadlineAt) {
			timeLimitReached = true;
			break;
		}
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
	}

	return {
		deleted,
		failed,
		failures,
		unprocessed: messages.length - deleted - failed,
		timeLimitReached: timeLimitReached || Date.now() >= deadlineAt,
	};
}
