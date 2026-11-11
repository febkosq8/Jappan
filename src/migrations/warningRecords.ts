import type { DatabaseMigration, MigrationProgress } from "../services/migrations.js";

const warningResetFilter = {
	$or: [{ warnings: { $not: { $type: "array" } } }, { "warnings.0": { $exists: true } }],
};

export const warningRecordsMigration: DatabaseMigration = {
	key: "guild-member-warning-records",
	shouldRun: async (database) =>
		(await database.collection("guildMemberStates").findOne(warningResetFilter)) !== null,
	run: async (database, reportProgress: (progress: MigrationProgress) => void) => {
		const collection = database.collection("guildMemberStates");
		const total = await collection.countDocuments(warningResetFilter);
		reportProgress({ completed: 0, total });

		const result = await collection.updateMany(warningResetFilter, [{ $set: { warnings: [] } }]);
		if (result.matchedCount !== total) {
			throw new Error("The number of guild member warning states changed during migration");
		}

		reportProgress({ completed: result.matchedCount, total });
	},
};
