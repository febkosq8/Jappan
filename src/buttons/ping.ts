import type { ButtonInteraction } from "discord.js";

import { executePing } from "../helpers/shared/ping.js";
import type { Config } from "../services/config.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";

const buttonData = { id: "Ping" } satisfies ButtonData;

export async function handlePing({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	await executePing({ interaction, config });
}

const button: ButtonModule = { buttonData, execute: handlePing };

export default button;
