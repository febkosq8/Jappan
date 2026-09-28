import type {
	APIEmbed,
	JSONEncodable,
	InteractionEditReplyOptions,
	InteractionReplyOptions,
	Message,
	MessageCreateOptions,
} from "discord.js";

import { MAX_EMBEDS_PER_MESSAGE, MAX_EMBED_CHARACTERS_PER_MESSAGE, getEmbedCharacterCount } from "./auditLog.js";

type ResponseEmbed = APIEmbed | JSONEncodable<APIEmbed>;
export type ResponseContent = Omit<MessageCreateOptions, "embeds" | "flags"> & {
	readonly embeds?: readonly ResponseEmbed[];
	readonly flags?: MessageCreateOptions["flags"] | InteractionReplyOptions["flags"];
};

export type ResponseDestination =
	| {
			readonly send: (content: MessageCreateOptions) => Promise<Message>;
	  }
	| {
			readonly deferred: boolean;
			readonly replied: boolean;
			readonly reply: (content: InteractionReplyOptions) => Promise<unknown>;
			readonly editReply: (content: InteractionEditReplyOptions) => Promise<unknown>;
			readonly followUp: (content: InteractionReplyOptions) => Promise<unknown>;
	  };

export interface SendResponseOptions {
	readonly replyToFirstMessage?: boolean;
}

function createResponsePages(content: ResponseContent): ResponseContent[] {
	const embeds = [...(content.embeds ?? [])];
	if (embeds.length === 0) {
		return [content];
	}

	const pages: ResponseContent[] = [];
	for (let start = 0; start < embeds.length;) {
		let end = start;
		let characterCount = 0;
		while (end < embeds.length && end - start < MAX_EMBEDS_PER_MESSAGE) {
			const embed = embeds[end];
			if (!embed) {
				break;
			}
			const embedCharacterCount = getEmbedCharacterCount(embed);
			if (end > start && characterCount + embedCharacterCount > MAX_EMBED_CHARACTERS_PER_MESSAGE) {
				break;
			}
			characterCount += embedCharacterCount;
			end += 1;
		}
		if (end === start) {
			end += 1;
		}
		pages.push({ ...content, embeds: embeds.slice(start, end) });
		start = end;
	}

	return pages;
}

export async function sendResponse(
	destination: ResponseDestination,
	content: ResponseContent,
	options: SendResponseOptions = {},
): Promise<Message | null> {
	const pages = createResponsePages(content);
	if ("send" in destination) {
		let firstMessage: Message | null = null;
		for (const page of pages) {
			const pageContent =
				options.replyToFirstMessage && firstMessage
					? { ...page, reply: { messageReference: firstMessage.id } }
					: page;
			const message = await destination.send(pageContent as MessageCreateOptions);
			firstMessage ??= message;
		}
		return firstMessage;
	}

	const [firstPage, ...remainingPages] = pages;
	if (!firstPage) {
		return null;
	}
	if (destination.deferred) {
		await destination.editReply(firstPage as InteractionEditReplyOptions);
	} else if (destination.replied) {
		await destination.followUp(firstPage as InteractionReplyOptions);
	} else {
		await destination.reply(firstPage as InteractionReplyOptions);
	}
	for (const page of remainingPages) {
		await destination.followUp(page as InteractionReplyOptions);
	}
	return null;
}
