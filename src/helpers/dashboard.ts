import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { Config } from "../services/config.js";

type GuildDashboardSection = "service-preferences" | "warnings" | "voice-region-locks";

interface CreateGuildDashboardUrlOptions {
	config: Config;
	guildId: string;
	section: GuildDashboardSection;
}

interface CreateDashboardLinkOptions {
	url: string;
	label: string;
}

function createDashboardLink({ url, label }: CreateDashboardLinkOptions) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url),
	);
}

export function createGuildDashboardUrl({ config, guildId, section }: CreateGuildDashboardUrlOptions): string {
	return new URL(`/guild/${encodeURIComponent(guildId)}#${section}`, config.BOT_WEBSITE).href;
}

export function createGuildDashboardLink(options: CreateGuildDashboardUrlOptions) {
	return createDashboardLink({
		url: createGuildDashboardUrl(options),
		label: "Manage in Dashboard",
	});
}

export function createPlaylistDashboardLink({ config }: { config: Config }) {
	return createDashboardLink({
		url: new URL("/playlists", config.BOT_WEBSITE).href,
		label: "Manage Playlists",
	});
}
