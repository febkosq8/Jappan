import type { ButtonInteraction } from "discord.js";
import type { Config } from "../services/config.js";
import { handleHelpCategory } from "./category.js";

export function handleLevelHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "level" });
}
