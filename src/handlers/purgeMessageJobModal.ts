import type { InteractionReplyOptions, ModalSubmitInteraction } from "discord.js";
import { ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";

import { formatInteractionLogDetails } from "../helpers/discord.js";
import { executePurgeMessageJobModal, purgeMessageJobModalCustomIdPrefix } from "../commands/purge-messages.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";
import { purgeableChannelTypes } from "../services/purgeMessagePreviews.js";

function getUserId(value: string): string | undefined | null {
	const trimmedValue = value.trim();
	if (!trimmedValue) return undefined;

	const mention = /^<@!?(\d{17,20})>$/u.exec(trimmedValue);
	if (mention?.[1]) return mention[1];
	return /^\d{17,20}$/u.test(trimmedValue) ? trimmedValue : null;
}

export async function handlePurgeMessageJobModalSubmit({
	interaction,
	config,
}: {
	interaction: ModalSubmitInteraction;
	config: Config;
}): Promise<void> {
	const startedAt = performance.now();
	const getExecutionLogDetails = () => ({
		...formatInteractionLogDetails(interaction),
		durationMs: Math.round(performance.now() - startedAt),
	});
	const respondWithError = async (content: string) => {
		const response: InteractionReplyOptions = { content, flags: MessageFlags.Ephemeral };
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(response);
		} else {
			await interaction.reply(response);
		}
	};

	try {
		const [prefix, guildId, ...extraParts] = interaction.customId.split(":");
		if (
			prefix !== purgeMessageJobModalCustomIdPrefix ||
			extraParts.length > 0 ||
			!guildId ||
			!/^\d{17,20}$/u.test(guildId)
		) {
			await respondWithError("⛔ This purge request is invalid or has expired.");
			return;
		}

		if (!interaction.guild || interaction.guildId !== guildId) {
			await respondWithError("⛔ This purge request must be completed in the original server.");
			return;
		}
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
			await respondWithError("⛔ You need the Manage Server permission to create a purge job.");
			return;
		}

		const userId = getUserId(interaction.fields.getTextInputValue("purge-job-user"));
		if (userId === null) {
			await respondWithError("⛔ Enter a valid user mention or ID, or leave the field blank.");
			return;
		}

		const rawCount = interaction.fields.getTextInputValue("purge-job-count").trim();
		if (!/^\d+$/u.test(rawCount)) {
			await respondWithError("⛔ Count must be a whole number between 1 and 200.");
			return;
		}
		const count = Number(rawCount);
		if (!Number.isInteger(count) || count < 1 || count > 200) {
			await respondWithError("⛔ Count must be a whole number between 1 and 200.");
			return;
		}

		const targetText = interaction.fields.getTextInputValue("purge-job-text");
		const selectedChannels = interaction.fields.getSelectedChannels(
			"purge-job-channel",
			false,
			purgeableChannelTypes,
		);
		if (selectedChannels && selectedChannels.size > 1) {
			await respondWithError("⛔ Select at most one channel.");
			return;
		}
		const selectedChannel = selectedChannels?.first();
		if (
			selectedChannel &&
			![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice].includes(
				selectedChannel.type,
			)
		) {
			await respondWithError("⛔ The selected channel cannot contain purgeable messages.");
			return;
		}
		await executePurgeMessageJobModal({
			interaction,
			config,
			...(selectedChannel ? { selectedChannelId: selectedChannel.id } : {}),
			...(userId ? { targetUserId: userId } : {}),
			...(targetText ? { targetText } : {}),
			count,
		});
		logger.info("SLASH_COMMANDS", "Purge message job modal completed", getExecutionLogDetails());
	} catch (error: unknown) {
		logger.error("SLASH_COMMANDS", "Failed to create purge message job from modal", {
			...getExecutionLogDetails(),
			error,
		});
		try {
			await respondWithError("⛔ There was an error while creating the purge job.");
		} catch (responseError: unknown) {
			logger.warn("SLASH_COMMANDS", "Could not respond to purge message job modal failure", {
				...getExecutionLogDetails(),
				error: responseError,
			});
		}
	}
}
