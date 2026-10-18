import { CronJob } from "cron";

import { logger } from "./logger.js";

export interface CronJobOptions {
	name: string;
	description: string;
	cronTime: string;
	humanCronTime: string;
	task: () => Promise<unknown> | unknown;
	runOnBoot?: boolean;
}

interface RegisteredCronJob {
	job: CronJob;
	details: {
		description: string;
		name: string;
		humanCronTime: string;
	};
}

const jobs = new Map<string, RegisteredCronJob>();

export function registerCronJob({
	name,
	description,
	cronTime,
	humanCronTime,
	task,
	runOnBoot = false,
}: CronJobOptions): CronJob {
	if (jobs.has(name)) {
		throw new Error(`Cron job already registered: ${name}`);
	}

	const details = { name, description, humanCronTime };
	const job = CronJob.from({
		cronTime,
		onTick: async () => {
			try {
				logger.info("CRON", "Cron job running", { name });
				await task();
			} catch (error: unknown) {
				logger.error("CRON", "Cron job failed", { name, error });
			}
		},
		start: false,
		waitForCompletion: true,
		name,
	});

	jobs.set(name, { job, details });
	logger.info("CRON", "Cron job registered", details);
	if (runOnBoot) {
		job.start();
		logger.info("CRON", "Cron job auto-started", { name });
	}
	return job;
}

export function startCronJobs(): void {
	for (const { job, details } of jobs.values()) {
		if (!job.isActive) {
			job.start();
			logger.info("CRON", "Cron job started", { name: details.name });
		}
	}
}

export function stopCronJobs(): void {
	for (const { job, details } of jobs.values()) {
		if (job.isActive) {
			job.stop();
			logger.info("CRON", "Cron job stopped", { name: details.name });
		}
	}
}
