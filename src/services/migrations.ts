import type mongoose from "mongoose";

import { migrations as registeredMigrations } from "../migrations/index.js";
import { logger } from "./logger.js";

export interface DatabaseMigration {
	readonly key: string;
	readonly shouldRun: (database: mongoose.mongo.Db) => boolean | Promise<boolean>;
	readonly run: (database: mongoose.mongo.Db) => void | Promise<void>;
}

export class MigrationError extends Error {
	constructor(key: string, cause: unknown) {
		super(`Database migration failed: ${key}`, { cause });
		this.name = "MigrationError";
	}
}

export async function runMigrations(
	database: mongoose.mongo.Db,
	migrations: readonly DatabaseMigration[] = registeredMigrations,
): Promise<void> {
	const keys = new Set<string>();
	for (const migration of migrations) {
		if (!migration.key.trim() || keys.has(migration.key)) {
			throw new MigrationError(migration.key, new Error("Migration keys must be nonempty and unique"));
		}
		keys.add(migration.key);
	}

	for (const migration of migrations) {
		try {
			if (!(await migration.shouldRun(database))) continue;
			logger.info("DATABASE", "Database migration started", { key: migration.key });
			await migration.run(database);
			logger.success("DATABASE", "Database migration completed", { key: migration.key });
		} catch (error: unknown) {
			throw new MigrationError(migration.key, error);
		}
	}
}
