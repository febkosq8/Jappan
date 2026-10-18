import type { Message } from "discord.js";

import { executePing } from "../helpers/shared/ping.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";

export async function handlePrefixPing({ message, config }: { message: Message; config: Config }): Promise<void> {
	if (message.author.bot) {
		return;
	}

	try {
		const { botLatency, gatewayLatency } = await executePing({ message, config });
		logger.info("DISCORD", "Prefix ping replied by direct message", {
			user: `${message.author.tag} <${message.author.id}>`,
			context: "dm",
			botLatency,
			gatewayLatency,
		});
	} catch (error: unknown) {
		logger.error("DISCORD", "Prefix ping direct message failed", {
			user: `${message.author.tag} <${message.author.id}>`,
			context: "dm",
			error,
		});
	} finally {
		await message.delete().catch(() => undefined);
	}
}
