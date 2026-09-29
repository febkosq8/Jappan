import mongoose from "mongoose";

import { logger } from "../services/logger.js";

type V1Document = Record<string, unknown>;

function getArguments(): { v1Url: string; v2Url: string } {
	const argumentsList = process.argv.slice(2).filter((argument, index) => !(index === 0 && argument === "--"));
	const v1Url = argumentsList[0];
	const v2Url = argumentsList[1];
	if (argumentsList.length !== 2 || !v1Url?.trim() || !v2Url?.trim()) {
		throw new Error("Usage: pnpm run migrate:v1tov2 -- <v1-db-url> <v2-db-url>");
	}
	if (v1Url === v2Url) {
		throw new Error("The v1 and v2 database URLs must be different");
	}
	return { v1Url, v2Url };
}

function stringValue(value: unknown, fallback?: string): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveNumber(value: unknown): number | null {
	const parsedValue = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function nonNegativeNumber(value: unknown): number {
	const parsedValue = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 0;
}

function booleanValue(value: unknown): boolean {
	return value === true;
}

function objectArray(value: unknown): V1Document[] {
	return Array.isArray(value)
		? value.filter((entry): entry is V1Document => typeof entry === "object" && entry !== null)
		: [];
}

function objectValue(value: unknown): V1Document {
	return typeof value === "object" && value !== null ? (value as V1Document) : {};
}

function mapGuild(v1Guild: V1Document): V1Document | undefined {
	const guildId = stringValue(v1Guild.guildId);
	const guildName = stringValue(v1Guild.guildName, guildId);
	if (!guildId || !guildName) {
		return undefined;
	}
	const announceChannelId = stringValue(v1Guild.announceChannelId) ?? null;
	return {
		guildId,
		guildName,
		auditLog: {
			enabled: booleanValue(v1Guild.auditActive),
			channelId: stringValue(v1Guild.auditChannelId) ?? null,
			fullVerbosity: booleanValue(v1Guild.auditFullVerbosity),
		},
		leveling: {
			enabled: v1Guild.levelActive !== false,
			threshold: positiveNumber(v1Guild.levelThreshold),
			roleId: stringValue(v1Guild.levelRoleId) ?? null,
		},
		memberAnnouncements: {
			joinEnabled: booleanValue(v1Guild.announceActive),
			leaveEnabled: booleanValue(v1Guild.announceActive),
			joinChannelId: announceChannelId,
			leaveChannelId: announceChannelId,
		},
		warnings: {
			timeoutThreshold: positiveNumber(v1Guild.warnTimeoutThreshold),
			timeoutDurationHours: positiveNumber(v1Guild.warnTimeoutDuration),
			banThreshold: positiveNumber(v1Guild.warnBanThreshold),
			auditChannelId: stringValue(v1Guild.warnAuditChannelId) ?? null,
		},
	};
}

function mapMemberStates(v1Guild: V1Document): V1Document[] {
	const guildId = stringValue(v1Guild.guildId);
	if (!guildId) {
		return [];
	}
	const states = new Map<string, V1Document>();
	for (const v1Member of objectArray(v1Guild.memberList)) {
		const userId = stringValue(v1Member.userid);
		if (!userId) {
			continue;
		}
		states.set(userId, {
			guildId,
			userId,
			username: stringValue(v1Member.username, userId),
			leveling: { points: nonNegativeNumber(v1Member.levelStat), level: 0 },
			warnings: { count: nonNegativeNumber(v1Member.warnStat) },
			voiceRegionLock: null,
		});
	}
	for (const watchedMember of objectArray(v1Guild.regionWatchMembers)) {
		const watchedUser = objectValue(watchedMember.user);
		const watchedChannel = objectValue(watchedMember.channel);
		const userId = stringValue(watchedUser.id);
		const channelId = stringValue(watchedChannel.id);
		const region = stringValue(watchedMember.region);
		if (!userId || !channelId || !region) {
			continue;
		}
		const state = states.get(userId) ?? {
			guildId,
			userId,
			username: stringValue(watchedUser.username, userId),
			leveling: { points: 0, level: 0 },
			warnings: { count: 0 },
		};
		state.voiceRegionLock = {
			channelId,
			channelName: stringValue(watchedChannel.name, channelId),
			region,
			fallbackRegion: null,
		};
		states.set(userId, state);
	}
	return [...states.values()];
}

function mapPlaylistEntries(value: unknown): V1Document[] {
	const entries: V1Document[] = [];
	const names = new Set<string>();
	for (const v1Entry of objectArray(value)) {
		const listname = stringValue(v1Entry.listname);
		const query = stringValue(v1Entry.query);
		if (!listname || !query || listname.length > 100 || query.length > 2000) {
			continue;
		}
		const normalizedName = listname.toLowerCase();
		if (names.has(normalizedName)) {
			continue;
		}
		names.add(normalizedName);
		entries.push({
			listname,
			query,
			shuffle: booleanValue(v1Entry.shuffle),
			loop: booleanValue(v1Entry.loop),
		});
	}
	return entries;
}

async function clearDatabase(connection: mongoose.Connection): Promise<void> {
	if (!connection.db) {
		throw new Error("MongoDB database handle was not available while clearing the v2 destination database");
	}
	const collections = await connection.db.listCollections().toArray();
	logger.info("DATABASE", "Clearing v2 destination database", { collections: collections.length });
	for (const collection of collections) {
		const result = await connection.db.collection(collection.name).deleteMany({});
		logger.info("DATABASE", "v2 destination collection cleared", {
			collection: collection.name,
			deletedDocuments: result.deletedCount,
		});
	}
}

async function waitBeforeClearingV2(): Promise<void> {
	logger.warn(
		"DATABASE",
		"DESTRUCTIVE OPERATION: the v2 destination database will be cleared in 10 seconds. Back up the destination database yourself before continuing. Press Ctrl+C to cancel.",
	);
	for (let secondsRemaining = 10; secondsRemaining > 0; secondsRemaining -= 1) {
		logger.warn("DATABASE", "v1 to v2 migration cancellation window", { secondsRemaining });
		await new Promise<void>((resolve) => setTimeout(resolve, 1000));
	}
	logger.warn("DATABASE", "Cancellation window ended; clearing the v2 destination database now");
}

async function migrate(): Promise<void> {
	const { v1Url, v2Url } = getArguments();
	logger.info("DATABASE", "v1 to v2 migration started");
	let v1Connection: mongoose.Connection | undefined;
	let newConnection: mongoose.Connection | undefined;
	let elapsedTimer: NodeJS.Timeout | undefined;
	try {
		v1Connection = await mongoose
			.createConnection(v1Url, {
				serverSelectionTimeoutMS: 10_000,
				readPreference: "secondaryPreferred",
				readConcernLevel: "majority",
				retryWrites: false,
			})
			.asPromise();
		logger.info("DATABASE", "Connected to v1 source database", { database: v1Connection.name });
		newConnection = await mongoose.createConnection(v2Url, { serverSelectionTimeoutMS: 10_000 }).asPromise();
		logger.info("DATABASE", "Connected to v2 destination database", { database: newConnection.name });
		const startedAt = Date.now();
		elapsedTimer = setInterval(() => {
			logger.info("DATABASE", "v1 to v2 migration still running", {
				elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
			});
		}, 10_000);
		elapsedTimer.unref();
		if (!v1Connection.db || !newConnection.db) {
			throw new Error("MongoDB database handles were not available after connecting");
		}
		const v1Guilds = await v1Connection.db.collection("guildlists").find({}).toArray();
		const v1Playlists = await v1Connection.db.collection("userplaylists").find({}).toArray();
		logger.info("DATABASE", "v1 data read", {
			guilds: v1Guilds.length,
			playlists: v1Playlists.length,
		});
		const guilds = newConnection.db.collection("guilds");
		const memberStates = newConnection.db.collection("guild_member_states");
		const playlists = newConnection.db.collection("userplaylists");

		await waitBeforeClearingV2();
		await clearDatabase(newConnection);
		logger.info("DATABASE", "v2 destination database cleared; migration writes starting");
		let migratedGuilds = 0;
		let migratedMemberStates = 0;
		let migratedPlaylists = 0;

		for (const [index, v1Guild] of v1Guilds.entries()) {
			const guild = mapGuild(v1Guild);
			if (!guild) {
				logger.warn("DATABASE", "Skipped v1 guild with missing identity", {
					position: index + 1,
					total: v1Guilds.length,
				});
				continue;
			}
			const memberStateList = mapMemberStates(v1Guild);
			logger.info("DATABASE", "Migrating guild", {
				position: index + 1,
				total: v1Guilds.length,
				guildId: guild.guildId,
				memberStates: memberStateList.length,
			});
			await guilds.insertOne(guild);
			migratedGuilds += 1;
			if (memberStateList.length > 0) {
				await memberStates.insertMany(memberStateList, { ordered: false });
				migratedMemberStates += memberStateList.length;
			}
			logger.info("DATABASE", "Guild migrated", {
				position: index + 1,
				total: v1Guilds.length,
				guildId: guild.guildId,
				memberStates: memberStateList.length,
				migratedMemberStates,
			});
		}

		for (const [index, v1Playlist] of v1Playlists.entries()) {
			const userId = stringValue(v1Playlist.userId);
			if (!userId) {
				logger.warn("DATABASE", "Skipped v1 playlist with missing user ID", {
					position: index + 1,
					total: v1Playlists.length,
				});
				continue;
			}
			const playlistEntries = mapPlaylistEntries(v1Playlist.queryList);
			logger.info("DATABASE", "Migrating user playlist", {
				position: index + 1,
				total: v1Playlists.length,
				userId,
				entries: playlistEntries.length,
			});
			await playlists.insertOne({
				userId,
				username: stringValue(v1Playlist.username, userId),
				queryList: playlistEntries,
			});
			migratedPlaylists += 1;
			logger.info("DATABASE", "User playlist migrated", {
				position: index + 1,
				total: v1Playlists.length,
				userId,
				entries: playlistEntries.length,
			});
		}

		logger.success("DATABASE", "v1 to v2 migration completed", {
			migratedGuilds,
			migratedMemberStates,
			migratedPlaylists,
		});
	} finally {
		if (elapsedTimer) {
			clearInterval(elapsedTimer);
		}
		logger.info("DATABASE", "Closing migration database connections");
		await Promise.all([v1Connection?.close(), newConnection?.close()]);
		logger.info("DATABASE", "Migration database connections closed");
	}
}

void migrate().catch((error: unknown) => {
	logger.error("DATABASE", "v1 to v2 migration failed", { error });
	process.exitCode = 1;
});
