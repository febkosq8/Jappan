import { randomInt } from "node:crypto";
import type { SendableChannels } from "discord.js";

const sentences = [
	"The channel is awake, and the conversation is just getting started.",
	"A tiny robot has arrived with a fresh batch of words.",
	"Somewhere, a keyboard is working very hard on an important message.",
	"Today's plan includes good company, a little curiosity, and plenty of snacks.",
	"The next great idea might be hiding in an ordinary conversation.",
	"A quiet afternoon is a perfectly good time for a small adventure.",
	"The imaginary coffee machine is ready for another round.",
	"Someone has probably opened one more browser tab than they needed.",
	"There is always room for another story and a different perspective.",
	"The playlist is ready, the lights are on, and everyone is welcome.",
	"A small celebration can make an otherwise ordinary day more interesting.",
	"The unofficial forecast calls for scattered jokes and occasional inspiration.",
] as const;

const gifLinks = [
	"https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
	"https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif",
] as const;

const activeChannels = new Set<string>();

function createRandomText(): string {
	const remaining = [...sentences];
	const selected: string[] = [];
	const count = randomInt(2, 5);
	for (let index = 0; index < count; index += 1) {
		const [sentence] = remaining.splice(randomInt(remaining.length), 1);
		if (!sentence) throw new Error("Failed to select a random sentence");
		selected.push(sentence);
	}
	return selected.join(randomInt(2) === 0 ? "\n" : " ");
}

export async function sendMessages({
	channel,
	count,
	text,
	includeGifs,
	onProgress,
}: {
	channel: Pick<SendableChannels, "id" | "send">;
	count: number;
	text?: string;
	includeGifs: boolean;
	onProgress: (sent: number) => void;
}): Promise<void> {
	if (!Number.isInteger(count) || count < 1 || count > 200) {
		throw new Error("Message count must be an integer between 1 and 200");
	}
	const messageText = text?.trim();
	if (messageText && messageText.length > 1800) {
		throw new Error("Message text must be at most 1800 characters");
	}
	if (activeChannels.has(channel.id)) {
		throw new Error("A message generation run is already active in this channel");
	}

	activeChannels.add(channel.id);
	try {
		for (let index = 0; index < count; index += 1) {
			let content = messageText || createRandomText();
			if (includeGifs && index % 3 === 0) {
				const gif = gifLinks[randomInt(gifLinks.length)];
				if (!gif) throw new Error("Failed to select a GIF link");
				content += `\n${gif}`;
			}
			await channel.send({ content, allowedMentions: { parse: [] } });
			onProgress(index + 1);
		}
	} finally {
		activeChannels.delete(channel.id);
	}
}
