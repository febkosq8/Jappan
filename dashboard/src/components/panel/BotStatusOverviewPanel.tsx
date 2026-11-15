import { DateHandler } from "@febkosq8/arc";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import type { BotStatus } from "@jappan/handlers/APIHandler";

export default function BotStatusOverviewPanel({
	bot,
	isError,
	updatedAt,
	healthUpdatedAt,
}: {
	bot: BotStatus | undefined;
	isError: boolean;
	updatedAt: number;
	healthUpdatedAt: number;
}) {
	return (
		<div>
			<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{[
					{ label: "Bot version", value: bot && `v${bot.version}` },
					{
						label: "Uptime",
						value:
							bot &&
							DateHandler.formatDuration(
								Math.max(
									0,
									Math.floor((Math.max(updatedAt, healthUpdatedAt) - bot.bootedTimestampMs) / 1000),
								),
							),
					},
					{ label: "Servers", value: bot?.guildCount.toLocaleString() },
					{ label: "Members", value: bot && (bot.memberCount?.toLocaleString() ?? "Unavailable") },
				].map(({ label, value }) => (
					<div key={label} className="min-w-0 rounded-md border border-border px-3 py-2">
						<dt className="text-sm text-muted-foreground">{label}</dt>
						<dd className="mt-1 font-medium">
							{bot ? (
								value
							) : isError ? (
								"Unavailable"
							) : (
								<LoadingIndicator
									label={`Loading ${label.toLowerCase()}`}
									inline
									size={60}
									rows={1}
									columns={5}
								/>
							)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
