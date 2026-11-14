import { performance } from "node:perf_hooks";
import type mongoose from "mongoose";

import { migrations as registeredMigrations } from "../migrations/index.js";
import { logger } from "./logger.js";

export interface MigrationProgress {
	readonly completed: number;
	readonly total: number;
}

export interface DatabaseMigration {
	readonly key: string;
	readonly shouldRun: (database: mongoose.mongo.Db) => boolean | Promise<boolean>;
	readonly run: (
		database: mongoose.mongo.Db,
		reportProgress: (progress: MigrationProgress) => void,
	) => void | Promise<void>;
}

const migrationProgressIntervalMs = 5_000;
const elapsedTimeUnits = [
	{ name: "year", milliseconds: 31_536_000_000 },
	{ name: "month", milliseconds: 2_592_000_000 },
	{ name: "day", milliseconds: 86_400_000 },
	{ name: "hour", milliseconds: 3_600_000 },
	{ name: "minute", milliseconds: 60_000 },
	{ name: "second", milliseconds: 1_000 },
] as const;

function formatElapsedDuration(elapsedMs: number): string {
	let remaining = Math.max(0, Math.floor(elapsedMs));
	const parts: string[] = [];

	for (const unit of elapsedTimeUnits) {
		const count = Math.floor(remaining / unit.milliseconds);
		remaining %= unit.milliseconds;
		if (count > 0) {
			parts.push(`${count} ${unit.name}${count === 1 ? "" : "s"}`);
		}
	}

	return parts.length > 0 ? parts.join(", ") : "0 milliseconds";
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
			const startedAt = performance.now();
			let progress: MigrationProgress = { completed: 0, total: 0 };
			logger.info("DATABASE", "Database migration started", { key: migration.key });
			const progressTimer = setInterval(() => {
				logger.info("DATABASE", "Database migration progress", {
					key: migration.key,
					...progress,
					elapsed: formatElapsedDuration(performance.now() - startedAt),
				});
			}, migrationProgressIntervalMs);

			try {
				await migration.run(database, (nextProgress) => {
					progress = nextProgress;
				});
			} catch (error: unknown) {
				logger.error("DATABASE", "Database migration failed", {
					key: migration.key,
					...progress,
					elapsed: formatElapsedDuration(performance.now() - startedAt),
				});
				throw error;
			} finally {
				clearInterval(progressTimer);
			}

			logger.success("DATABASE", "Database migration completed", {
				key: migration.key,
				...progress,
				elapsed: formatElapsedDuration(performance.now() - startedAt),
			});
		} catch (error: unknown) {
			throw new MigrationError(migration.key, error);
		}
	}
}
