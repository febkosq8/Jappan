import { CronJob } from "cron";

import { logger } from "./logger.js";

export interface CronJobOptions {
	name: string;
	description: string;
	cronTime: string;
	humanCronTime: string;
	task: () => Promise<unknown> | unknown;
	runOnBoot?: boolean;
	runOnStart?: boolean;
}

interface RegisteredCronJob {
	job: CronJob;
	task: CronJobOptions["task"];
	runOnStart: boolean;
	hasRunOnStart: boolean;
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
	runOnStart = false,
}: CronJobOptions): CronJob {
	if (jobs.has(name)) {
		throw new Error(`Cron job already registered: ${name}`);
	}

	const details = { name, description, humanCronTime };
	const job = CronJob.from({
		cronTime,
		onTick: async () => {
			await runCronTask(name, task);
		},
		start: false,
		waitForCompletion: true,
		name,
	});

	const registeredJob: RegisteredCronJob = {
		job,
		task,
		runOnStart,
		hasRunOnStart: false,
		details,
	};
	jobs.set(name, registeredJob);
	logger.info("CRON", "Cron job registered", details);
	if (runOnBoot) {
		startCronJob(registeredJob, "Cron job auto-started");
	}
	return job;
}

export function startCronJobs(): void {
	for (const registeredJob of jobs.values()) {
		if (!registeredJob.job.isActive) {
			startCronJob(registeredJob, "Cron job started");
		}
	}
}

function startCronJob(registeredJob: RegisteredCronJob, message: string): void {
	registeredJob.job.start();
	logger.info("CRON", message, { name: registeredJob.details.name });
	if (registeredJob.runOnStart && !registeredJob.hasRunOnStart) {
		registeredJob.hasRunOnStart = true;
		void runCronTask(registeredJob.details.name, registeredJob.task);
	}
}

async function runCronTask(name: string, task: CronJobOptions["task"]): Promise<void> {
	try {
		logger.info("CRON", "Cron job running", { name });
		await task();
	} catch (error: unknown) {
		logger.error("CRON", "Cron job failed", { name, error });
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
