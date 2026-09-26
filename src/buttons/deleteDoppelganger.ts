import { MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import type { Config } from "../services/config.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";

const buttonData = { id: "DeleteDoppelganger" } satisfies ButtonData;

export async function handleDeleteDoppelganger({
	interaction,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	const [, messageId, channelId, authorizedUserId] = interaction.customId.split("|");
	if (!messageId || !channelId || !authorizedUserId || interaction.user.id !== authorizedUserId) {
		await interaction.reply({ content: "You cannot delete this message.", flags: MessageFlags.Ephemeral });
		return;
	}

	await interaction.deferUpdate();
	const channel = await interaction.client.channels.fetch(channelId);
	if (!channel?.isTextBased() || !("messages" in channel)) {
		await interaction.editReply({ content: "The original channel is no longer available.", components: [] });
		return;
	}

	try {
		const message = await channel.messages.fetch(messageId);
		await message.delete();
		await interaction.editReply({ content: "The doppelganger message was deleted.", components: [] });
	} catch {
		await interaction.editReply({ content: "The doppelganger message could not be deleted.", components: [] });
	}
}

const button: ButtonModule = { buttonData, execute: handleDeleteDoppelganger };

export default button;
