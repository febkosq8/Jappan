import mongoose from "mongoose";

import { logger } from "../services/logger.js";

type LegacyDocument = Record<string, unknown>;

function getArguments(): { legacyUrl: string; newUrl: string } {
	const argumentsList = process.argv.slice(2).filter((argument, index) => !(index === 0 && argument === "--"));
	const legacyUrl = argumentsList[0];
	const newUrl = argumentsList[1];
	if (argumentsList.length !== 2 || !legacyUrl?.trim() || !newUrl?.trim()) {
		throw new Error("Usage: pnpm run migrate:legacy -- <old-db-url> <new-db-url>");
	}
	if (legacyUrl === newUrl) {
		throw new Error("The old and new database URLs must be different");
	}
	return { legacyUrl, newUrl };
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

function objectArray(value: unknown): LegacyDocument[] {
	return Array.isArray(value)
		? value.filter((entry): entry is LegacyDocument => typeof entry === "object" && entry !== null)
		: [];
}

function objectValue(value: unknown): LegacyDocument {
	return typeof value === "object" && value !== null ? (value as LegacyDocument) : {};
}

function mapGuild(legacyGuild: LegacyDocument): LegacyDocument | undefined {
	const guildId = stringValue(legacyGuild.guildId);
	const guildName = stringValue(legacyGuild.guildName, guildId);
	if (!guildId || !guildName) {
		return undefined;
	}
	const announceChannelId = stringValue(legacyGuild.announceChannelId) ?? null;
	return {
		guildId,
		guildName,
		auditLog: {
			enabled: booleanValue(legacyGuild.auditActive),
			channelId: stringValue(legacyGuild.auditChannelId) ?? null,
			fullVerbosity: booleanValue(legacyGuild.auditFullVerbosity),
		},
		leveling: {
			enabled: legacyGuild.levelActive !== false,
			threshold: positiveNumber(legacyGuild.levelThreshold),
			roleId: stringValue(legacyGuild.levelRoleId) ?? null,
		},
		memberAnnouncements: {
			joinEnabled: booleanValue(legacyGuild.announceActive),
			leaveEnabled: booleanValue(legacyGuild.announceActive),
			joinChannelId: announceChannelId,
			leaveChannelId: announceChannelId,
		},
		warnings: {
			timeoutThreshold: positiveNumber(legacyGuild.warnTimeoutThreshold),
			timeoutDurationHours: positiveNumber(legacyGuild.warnTimeoutDuration),
			banThreshold: positiveNumber(legacyGuild.warnBanThreshold),
			auditChannelId: stringValue(legacyGuild.warnAuditChannelId) ?? null,
		},
	};
}

function mapMemberStates(legacyGuild: LegacyDocument): LegacyDocument[] {
	const guildId = stringValue(legacyGuild.guildId);
	if (!guildId) {
		return [];
	}
	const states = new Map<string, LegacyDocument>();
	for (const legacyMember of objectArray(legacyGuild.memberList)) {
		const userId = stringValue(legacyMember.userid);
		if (!userId) {
			continue;
		}
		states.set(userId, {
			guildId,
			userId,
			username: stringValue(legacyMember.username, userId),
			leveling: { points: nonNegativeNumber(legacyMember.levelStat), level: 0 },
			warnings: { count: nonNegativeNumber(legacyMember.warnStat) },
			voiceRegionLock: null,
		});
	}
	for (const watchedMember of objectArray(legacyGuild.regionWatchMembers)) {
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

function mapPlaylistEntries(value: unknown): LegacyDocument[] {
	const entries: LegacyDocument[] = [];
	const names = new Set<string>();
	for (const legacyEntry of objectArray(value)) {
		const listname = stringValue(legacyEntry.listname);
		const query = stringValue(legacyEntry.query);
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
			shuffle: booleanValue(legacyEntry.shuffle),
			loop: booleanValue(legacyEntry.loop),
		});
	}
	return entries;
}

async function clearDatabase(connection: mongoose.Connection): Promise<void> {
	if (!connection.db) {
		throw new Error("MongoDB database handle was not available while clearing the target database");
	}
	const collections = await connection.db.listCollections().toArray();
	logger.info("DATABASE", "Clearing target database", { collections: collections.length });
	for (const collection of collections) {
		const result = await connection.db.collection(collection.name).deleteMany({});
		logger.info("DATABASE", "Target collection cleared", {
			collection: collection.name,
			deletedDocuments: result.deletedCount,
		});
	}
}

async function migrate(): Promise<void> {
	const { legacyUrl, newUrl } = getArguments();
	logger.info("DATABASE", "Legacy migration started");
	const legacyConnection = await mongoose
		.createConnection(legacyUrl, {
			serverSelectionTimeoutMS: 10_000,
			readPreference: "secondaryPreferred",
			readConcernLevel: "majority",
			retryWrites: false,
		})
		.asPromise();
	logger.info("DATABASE", "Connected to legacy database", { database: legacyConnection.name });
	const newConnection = await mongoose.createConnection(newUrl, { serverSelectionTimeoutMS: 10_000 }).asPromise();
	logger.info("DATABASE", "Connected to target database", { database: newConnection.name });
	const startedAt = Date.now();
	const elapsedTimer = setInterval(() => {
		logger.info("DATABASE", "Legacy migration still running", {
			elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
		});
	}, 10_000);
	elapsedTimer.unref();
	try {
		if (!legacyConnection.db || !newConnection.db) {
			throw new Error("MongoDB database handles were not available after connecting");
		}
		const legacyGuilds = await legacyConnection.db.collection("guildlists").find({}).toArray();
		const legacyPlaylists = await legacyConnection.db.collection("userplaylists").find({}).toArray();
		logger.info("DATABASE", "Legacy data read", {
			guilds: legacyGuilds.length,
			playlists: legacyPlaylists.length,
		});
		const guilds = newConnection.db.collection("guilds");
		const memberStates = newConnection.db.collection("guild_member_states");
		const playlists = newConnection.db.collection("userplaylists");

		await clearDatabase(newConnection);
		logger.info("DATABASE", "Target database cleared; migration writes starting");
		let migratedGuilds = 0;
		let migratedMemberStates = 0;
		let migratedPlaylists = 0;

		for (const [index, legacyGuild] of legacyGuilds.entries()) {
			const guild = mapGuild(legacyGuild);
			if (!guild) {
				logger.warn("DATABASE", "Skipped legacy guild with missing identity", {
					position: index + 1,
					total: legacyGuilds.length,
				});
				continue;
			}
			const memberStateList = mapMemberStates(legacyGuild);
			logger.info("DATABASE", "Migrating guild", {
				position: index + 1,
				total: legacyGuilds.length,
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
				total: legacyGuilds.length,
				guildId: guild.guildId,
				memberStates: memberStateList.length,
				migratedMemberStates,
			});
		}

		for (const [index, legacyPlaylist] of legacyPlaylists.entries()) {
			const userId = stringValue(legacyPlaylist.userId);
			if (!userId) {
				logger.warn("DATABASE", "Skipped legacy playlist with missing user ID", {
					position: index + 1,
					total: legacyPlaylists.length,
				});
				continue;
			}
			const playlistEntries = mapPlaylistEntries(legacyPlaylist.queryList);
			logger.info("DATABASE", "Migrating user playlist", {
				position: index + 1,
				total: legacyPlaylists.length,
				userId,
				entries: playlistEntries.length,
			});
			await playlists.insertOne({
				userId,
				username: stringValue(legacyPlaylist.username, userId),
				queryList: playlistEntries,
			});
			migratedPlaylists += 1;
			logger.info("DATABASE", "User playlist migrated", {
				position: index + 1,
				total: legacyPlaylists.length,
				userId,
				entries: playlistEntries.length,
			});
		}

		logger.success("DATABASE", "Legacy migration completed", {
			migratedGuilds,
			migratedMemberStates,
			migratedPlaylists,
		});
	} finally {
		clearInterval(elapsedTimer);
		logger.info("DATABASE", "Closing migration database connections");
		await Promise.all([legacyConnection.close(), newConnection.close()]);
		logger.info("DATABASE", "Migration database connections closed");
	}
}

void migrate().catch((error: unknown) => {
	logger.error("DATABASE", "Legacy migration failed", { error });
	process.exitCode = 1;
});
