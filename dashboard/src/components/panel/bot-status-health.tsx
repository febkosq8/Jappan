import { Tag } from "@febkosq8/arc";
import { FiAlertTriangle, FiCheckCircle, FiXCircle } from "react-icons/fi";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import type { BotStatus, HealthResponse } from "@jappan/handlers/APIHandler";

const serviceNames = [
	{ key: "db", label: "Database" },
	{ key: "discord", label: "Discord bot" },
	{ key: "player", label: "Music player" },
] as const;

export default function BotStatusHealth({
	health,
	healthIsError,
	bot,
	botIsError,
}: {
	health: HealthResponse | undefined;
	healthIsError: boolean;
	bot: BotStatus | undefined;
	botIsError: boolean;
}) {
	return (
		<div>
			<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
				{serviceNames.map(({ key, label }) => {
					const healthy = health?.services[key];
					const unavailable = healthIsError && !health;
					const StatusIcon = healthy === undefined ? FiAlertTriangle : healthy ? FiCheckCircle : FiXCircle;
					return (
						<li
							key={key}
							className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-base"
						>
							<span className="text-muted-foreground">{label}</span>
							<Tag
								variant={
									healthy === undefined
										? unavailable
											? "warning"
											: "secondary"
										: healthy
											? "success"
											: "destructive"
								}
								size="sm"
							>
								{healthy === undefined && !unavailable ? (
									<span className="mr-1 inline-flex items-center justify-center">
										<LoadingIndicator
											label={`Checking ${label}`}
											inline
											decorative
											size={40}
											rows={1}
											columns={3}
										/>
									</span>
								) : (
									<StatusIcon
										className={`mr-1 inline size-4 ${healthy === undefined ? "text-warning-foreground" : healthy ? "text-success-foreground" : "text-destructive-foreground"}`}
										aria-hidden="true"
									/>
								)}
								{healthy === undefined
									? unavailable
										? "Unavailable"
										: "Checking"
									: healthy
										? "Operational"
										: "Unavailable"}
							</Tag>
						</li>
					);
				})}
			</ul>
			<dl className="mt-3 rounded-md border border-border px-3 py-2">
				<dt className="text-sm text-muted-foreground">Gateway latency</dt>
				<dd className="mt-1 font-medium">
					{bot ? (
						bot.gatewayLatencyMs === null ? (
							"Unavailable"
						) : (
							`${bot.gatewayLatencyMs.toLocaleString()} ms`
						)
					) : botIsError ? (
						"Unavailable"
					) : (
						<LoadingIndicator label="Loading gateway latency" inline size={60} rows={1} columns={5} />
					)}
				</dd>
			</dl>
		</div>
	);
}
