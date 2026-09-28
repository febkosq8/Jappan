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
			readonly fetchReply: () => Promise<Message>;
			readonly editReply: (content: InteractionEditReplyOptions) => Promise<Message>;
			readonly followUp: (content: InteractionReplyOptions) => Promise<Message>;
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

export async function sendResponse({
	destination,
	content,
	options = {},
}: {
	destination: ResponseDestination;
	content: ResponseContent;
	options?: SendResponseOptions;
}): Promise<Message[]> {
	const pages = createResponsePages(content);
	if ("send" in destination) {
		const messages: Message[] = [];
		for (const page of pages) {
			const pageContent =
				options.replyToFirstMessage && messages[0]
					? { ...page, reply: { messageReference: messages[0].id } }
					: page;
			const message = await destination.send(pageContent as MessageCreateOptions);
			messages.push(message);
		}
		return messages;
	}

	const [firstPage, ...remainingPages] = pages;
	if (!firstPage) {
		return [];
	}
	const messages: Message[] = [];
	if (destination.deferred) {
		messages.push(await destination.editReply(firstPage as InteractionEditReplyOptions));
	} else if (destination.replied) {
		messages.push(await destination.followUp(firstPage as InteractionReplyOptions));
	} else {
		await destination.reply(firstPage as InteractionReplyOptions);
		messages.push(await destination.fetchReply());
	}
	for (const page of remainingPages) {
		messages.push(await destination.followUp(page as InteractionReplyOptions));
	}
	return messages;
}
