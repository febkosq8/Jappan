import { Types } from "mongoose";

import type { DatabaseMigration, MigrationProgress } from "../services/migrations.js";

const legacyWarningReason = "Legacy warning migrated from a stored count; original details unknown.";

interface LegacyGuildMemberState {
	[key: string]: unknown;
	_id: Types.ObjectId;
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
			{ projection: { _id: 1, "warnings.count": 1 } },
		);
		let completed = 0;
		reportProgress({ completed, total });

		for await (const member of cursor) {
			const count = member.warnings?.count;
			if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
				throw new Error(`Invalid legacy warning count for guild member state ${member._id.toString()}`);
			}

			const records = Array.from({ length: count }, () => ({
				_id: new Types.ObjectId(),
				issuedAt: null,
				reason: legacyWarningReason,
				issuerId: null,
				thresholdAction: "unknown",
			}));
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
