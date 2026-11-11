import type { DatabaseMigration } from "../services/migrations.js";
import { warningRecordsMigration } from "./warningRecords.js";

export const migrations: readonly DatabaseMigration[] = [warningRecordsMigration];
