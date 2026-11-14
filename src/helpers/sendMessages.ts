import { randomInt } from "node:crypto";
import { EmbedBuilder } from "discord.js";
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
	"A fresh idea just walked into the room and brought snacks.",
	"The best plans leave a little room for a happy surprise.",
	"Somewhere nearby, a dog is having an excellent day.",
	"Take a deep breath; the next step can be a small one.",
	"The group chat has officially entered its cheerful era.",
	"A good question can turn a quiet moment into a great conversation.",
	"The imaginary office plant is thriving on good vibes.",
	"Today's tiny achievement deserves a tiny victory dance.",
	"The moon is doing its best work, even if nobody asked.",
	"A curious mind can find a story in almost anything.",
	"The snack committee has approved one more snack break.",
	"Every great adventure starts with someone saying, why not?",
	"The room got a little brighter when everyone showed up.",
	"Some ideas need a second cup of tea before they make sense.",
	"A friendly reminder that progress still counts when it is slow.",
	"The weekend is somewhere on the horizon, waving enthusiastically.",
	"An invisible orchestra is playing the soundtrack to this moment.",
	"Good teamwork is just several people being helpful at once.",
	"The tiny cloud outside looks like it has an important meeting.",
	"One kind message can improve an entire afternoon.",
	"The next chapter is unwritten, which is honestly pretty exciting.",
	"A little laughter is a perfectly reasonable use of the schedule.",
	"The imaginary confetti cannon is standing by for good news.",
	"Curiosity has entered the chat and brought a notebook.",
	"Even the smallest win can make a day feel much bigger.",
	"The neighborhood squirrels have started a very secret committee.",
	"Somewhere, a kettle is preparing for its starring moment.",
	"New perspectives make familiar conversations feel brand new.",
	"The day is going better now that everyone is here.",
	"A tiny detour can sometimes lead to the best story.",
	"Friendly robots everywhere approve of this conversation.",
	"The unofficial motto today is be kind and keep going.",
	"That was a surprisingly good time to remember to stretch.",
	"An excellent plan is forming, possibly near the snack table.",
	"The imaginary scoreboard says everyone is doing great.",
	"Let's leave a little space for one more good idea.",
	"Somewhere, a very small bird is singing with great confidence.",
	"The imaginary lighthouse is shining a beam toward better conversations.",
	"A little patience can make room for a much better answer.",
	"Today's agenda includes good company and absolutely no rush.",
] as const;

const gifLinks = [
	"https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
	"https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif",
	"https://media.giphy.com/media/gKHGnB1ml0moQdjhEJ/giphy.gif",
	"https://media.giphy.com/media/IYjcAIri8C7f8LvLor/giphy.gif",
	"https://media.giphy.com/media/Fu3OjBQiCs3s0ZuLY3/giphy.gif",
	"https://media.giphy.com/media/HfFccPJv7a9k4/giphy.gif",
	"https://media.giphy.com/media/Qf1glkIPvRMlXOO1Pv/giphy.gif",
	"https://media.giphy.com/media/UuzwffmvtBNGjYyEUe/giphy.gif",
	"https://media.giphy.com/media/iJJ6E58EttmFqgLo96/giphy.gif",
	"https://media.giphy.com/media/UpobWd0mSpRfO/giphy.gif",
	"https://media.giphy.com/media/Rl67R9m5yFCpoiQhAY/giphy.gif",
	"https://media.giphy.com/media/RvMsB2IktjOLbUo6bd/giphy.gif",
	"https://media.giphy.com/media/lnieUIckonF4eA0tGF/giphy.gif",
	"https://media.giphy.com/media/zuToboIbXRuNgXNqK2/giphy.gif",
	"https://media.giphy.com/media/YrD1PQldGsstG/giphy.gif",
	"https://media.giphy.com/media/xSM46ernAUN3y/giphy.gif",
	"https://media.giphy.com/media/cmawvBFoILiIFkpfvl/giphy.gif",
	"https://media.giphy.com/media/meJN6qdG74lUKAJTQl/giphy.gif",
	"https://media.giphy.com/media/XfHppzcyVGwmLXZhiE/giphy.gif",
	"https://media.giphy.com/media/sWBzg2D15WwQjHcxbt/giphy.gif",
	"https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
	"https://media.giphy.com/media/8qABb3dgjun8PdNirg/giphy.gif",
	"https://media.giphy.com/media/SYeAP17mD2FOIR2CzR/giphy.gif",
	"https://media.giphy.com/media/gpXfKa9xLAR56/giphy.gif",
	"https://media.giphy.com/media/Fu9EXNUgJBRBe/giphy.gif",
	"https://media.giphy.com/media/8ac9tQi8GtuJaW8HBJ/giphy.gif",
	"https://media.giphy.com/media/Fkmgse8OMKn9C/giphy.gif",
	"https://media.giphy.com/media/3Vmg7DEoAOKIIu1bhM/giphy.gif",
	"https://media.giphy.com/media/IfMwBNFJAfwF7kLRYi/giphy.gif",
	"https://media.giphy.com/media/XhQlmR2DBMrUOOFPEa/giphy.gif",
	"https://media.giphy.com/media/bPRp7y5gk2nIMktFZM/giphy.gif",
	"https://media.giphy.com/media/G20NLPL3ozyCdIm8gq/giphy.gif",
	"https://media.giphy.com/media/PspAfOK1HeOqkpPGNQ/giphy.gif",
	"https://media.giphy.com/media/dQbC2Nnniekzdqjady/giphy.gif",
	"https://media.giphy.com/media/TBPgDqgXjyQDLBIsfm/giphy.gif",
	"https://media.giphy.com/media/2xrdqamkdJhb5qeJbN/giphy.gif",
	"https://media.giphy.com/media/P9TfGpNFpOUWgM7VBz/giphy.gif",
	"https://media.giphy.com/media/5vEV6GpUXQWMc3jrHY/giphy.gif",
	"https://media.giphy.com/media/atb9KSN6oBasQysj1h/giphy.gif",
	"https://media.giphy.com/media/so9bIuxK0Z9AsqI3lq/giphy.gif",
	"https://media.giphy.com/media/fhbyQh3z25iAnzop5b/giphy.gif",
	"https://media.giphy.com/media/zwp23i0bf9QPZZRVf5/giphy.gif",
	"https://media.giphy.com/media/1k3um6F4CAjJ26cz5b/giphy.gif",
	"https://media.giphy.com/media/GFdI4qyQrxkirjIvMC/giphy.gif",
	"https://media.giphy.com/media/3tHWDhE1m8ihut3cqN/giphy.gif",
	"https://media.giphy.com/media/CqT51GHKmZ73Qi6w3N/giphy.gif",
	"https://media.giphy.com/media/fHoqSTQTsgSbfUoiTw/giphy.gif",
	"https://media.giphy.com/media/as521kub4b68hW2JhK/giphy.gif",
	"https://media.giphy.com/media/xqBpxjk7CXLtm/giphy.gif",
	"https://media.giphy.com/media/13BwjdpxACoBPO/giphy.gif",
	"https://media.giphy.com/media/nU0EccnuhJa5ofFr6v/giphy.gif",
	"https://media.giphy.com/media/de9SDw6PGRsubN1o3X/giphy.gif",
] as const;

const maxConcurrentSends = 5;

export type MessageType = "all" | "gif" | "text" | "embed";
type GeneratedMessageType = Exclude<MessageType, "all">;

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

function chooseMessageType(messageType: MessageType): GeneratedMessageType {
	if (messageType !== "all") return messageType;
	switch (randomInt(3)) {
		case 0:
			return "gif";
		case 1:
			return "text";
		default:
			return "embed";
	}
}

export async function sendMessages({
	channel,
	count,
	jobId,
	messageType,
	text,
	onProgress,
}: {
	channel: Pick<SendableChannels, "id" | "send">;
	count: number;
	jobId: string;
	messageType: MessageType;
	text?: string;
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
		const sendMessage = async (index: number): Promise<void> => {
			const content = messageText || createRandomText();
			const selectedType = chooseMessageType(messageType);
			const footer = { text: `Message ${index + 1}/${count} | Job ID: ${jobId}` };

			switch (selectedType) {
				case "gif": {
					const gif = gifLinks[randomInt(gifLinks.length)];
					if (!gif) throw new Error("Failed to select a GIF link");
					const embed = new EmbedBuilder().setImage(gif);
					await channel.send({ content: footer.text, embeds: [embed], allowedMentions: { parse: [] } });
					break;
				}
				case "text": {
					await channel.send({
						content: `${content}\n\n${footer.text}`,
						allowedMentions: { parse: [] },
					});
					break;
				}
				case "embed": {
					const embed = new EmbedBuilder().setDescription(content).setFooter(footer);
					await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
					break;
				}
			}
		};

		let sent = 0;
		for (let start = 0; start < count; start += maxConcurrentSends) {
			const batchSize = Math.min(maxConcurrentSends, count - start);
			const results = await Promise.allSettled(
				Array.from({ length: batchSize }, (_, offset) => sendMessage(start + offset)),
			);
			let hasError = false;
			let firstError: unknown;
			for (const result of results) {
				if (result.status === "fulfilled") {
					sent += 1;
					onProgress(sent);
				} else if (!hasError) {
					hasError = true;
					firstError = result.reason;
				}
			}
			if (hasError) throw firstError;
		}
	} finally {
		activeChannels.delete(channel.id);
	}
}
