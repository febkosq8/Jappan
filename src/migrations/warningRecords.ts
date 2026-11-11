import { REST, Routes, type RESTGetAPIGuildResult } from "discord.js";
import { Types } from "mongoose";

import type { DatabaseMigration, MigrationProgress } from "../services/migrations.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";

const legacyWarningReason = "Legacy warning migrated from a stored count; original details unknown.";

interface LegacyGuildMemberState {
	[key: string]: unknown;
	_id: Types.ObjectId;
	guildId: string;
	userId: string;
	warnings?: { count?: unknown };
}

export const warningRecordsMigration: DatabaseMigration = {
	key: "guild-member-warning-records",
	shouldRun: async (database) =>
		(await database.collection("guildMemberStates").findOne({ "warnings.count": { $exists: true } })) !== null,
	run: async (database, reportProgress: (progress: MigrationProgress) => void) => {
		const collection = database.collection<LegacyGuildMemberState>("guildMemberStates");
		const total = await collection.countDocuments({ "warnings.count": { $exists: true } });
		const cursor = collection.find(
			{ "warnings.count": { $exists: true } },
			{ projection: { _id: 1, guildId: 1, userId: 1, "warnings.count": 1 } },
		);
		const rest = new REST({ version: "10" }).setToken(getConfig("DISCORD_TOKEN"));
		const migratedAt = new Date();
		const ownerIds = new Map<string, string | null>();
		let completed = 0;
		reportProgress({ completed, total });

		const getGuildOwnerId = async (guildId: string): Promise<string | null> => {
			if (ownerIds.has(guildId)) {
				return ownerIds.get(guildId) ?? null;
			}

			try {
				const guild = (await rest.get(Routes.guild(guildId))) as RESTGetAPIGuildResult;
				ownerIds.set(guildId, guild.owner_id);
				return guild.owner_id;
			} catch (error: unknown) {
				logger.warn("DATABASE", "Could not resolve guild owner; legacy warnings will be skipped", {
					guildId,
					error,
				});
				ownerIds.set(guildId, null);
				return null;
			}
		};

		for await (const member of cursor) {
			const count = member.warnings?.count;
			if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
				throw new Error(`Invalid legacy warning count for guild member state ${member._id.toString()}`);
			}

			const issuerId = count > 0 ? await getGuildOwnerId(member.guildId) : null;
			const records = issuerId
				? Array.from({ length: count }, () => ({
						_id: new Types.ObjectId(),
						issuedAt: migratedAt,
						reason: legacyWarningReason,
						issuerId,
						thresholdAction: "unknown",
					}))
				: [];
			const result = await collection.updateOne({ _id: member._id, "warnings.count": count }, [
				{ $set: { warnings: records } },
			]);

			if (result.matchedCount !== 1) {
				throw new Error(
					`Legacy warning count changed during migration for guild member state ${member._id.toString()}`,
				);
			}
			completed += 1;
			reportProgress({ completed, total });
		}
	},
};
