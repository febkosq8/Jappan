import { DefaultExtractors } from "@discord-player/extractor";
import { load as loadExtractors } from "@extractorpack/extractorpack";
import { Player, type SearchResult } from "discord-player";
import type { Client, GuildMember } from "discord.js";

import { getConfig } from "./config.js";
import { logger } from "./logger.js";

let player: Player | undefined;

function registerPlayerDebugListeners(): void {
	const initializedPlayer = getPlayer();

	initializedPlayer.on("debug", (message) => {
		logger.debug("PLAYER", message);
	});
	initializedPlayer.events.on("debug", (queue, message) => {
		logger.debug("PLAYER", `Queue ${queue.guild.id}: ${message}`);
	});
	logger.info("PLAYER", "Player debug listeners loaded");
}

function registerPlayerListeners(): void {
	const initializedPlayer = getPlayer();
	initializedPlayer.on("error", (error) => {
		logger.error("PLAYER", `Player error: ${error.message}`, { stack: error.stack });
	});
	initializedPlayer.events.on("error", (queue, error) => {
		logger.error("PLAYER", `Queue ${queue.guild.id} error: ${error.message}`, {
			stack: error.stack,
			track: queue.currentTrack?.title,
		});
	});
}

export async function initializePlayer(client: Client): Promise<Player> {
	if (player) {
		return player;
	}

	const playerOptions = {
		skipFFmpeg: false,
	};
	const initializedPlayer = new Player(client as unknown as ConstructorParameters<typeof Player>[0], playerOptions);
	await loadExtractors(initializedPlayer);
	await initializedPlayer.extractors.loadMulti(DefaultExtractors);
	player = initializedPlayer;
	registerPlayerListeners();
	if (getConfig("PLAYER_DEBUG")) {
		registerPlayerDebugListeners();
	}
	logger.info("PLAYER", "Player initialized", {
		extractorsCount: initializedPlayer.extractors.store.size,
	});
	return initializedPlayer;
}

export function getPlayer(): Player {
	if (!player) {
		throw new Error("Player has not been initialized");
	}

	return player;
}

export async function searchPlayer(query: string): Promise<SearchResult> {
	return getPlayer().search(query, { fallbackSearchEngine: "youtubeSearch" });
}

export async function playSearchResult({
	channel,
	member,
	searchResult,
}: {
	channel: string;
	member: GuildMember;
	searchResult: SearchResult;
}): Promise<void> {
	await getPlayer().play(channel, searchResult, {
		nodeOptions: {
			metadata: { requestedBy: member.user.id },
			bufferingTimeout: 15000,
			leaveOnStop: true,
			leaveOnStopCooldown: 5000,
			leaveOnEnd: true,
			leaveOnEndCooldown: 15000,
			leaveOnEmpty: true,
			leaveOnEmptyCooldown: 300000,
		},
		requestedBy: member.user.id,
	});
}
