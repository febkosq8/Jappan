import { Button, PreviewCard } from "@febkosq8/arc";
import { RiInfoCardLine } from "react-icons/ri";

const latencyHelp = {
	gateway: {
		label: "Gateway latency",
		measure: "Round-trip time between the bot and Discord's Gateway.",
		calculation: "Discord.js reads the latest WebSocket heartbeat ping, in milliseconds.",
	},
	api: {
		label: "Dashboard API latency",
		measure: "Total time taken for the dashboard's bot-status request to return.",
		calculation:
			"Measured in the browser from request start to response, rounded to the nearest millisecond. Includes network and server processing, not Discord command execution.",
	},
} as const;

export default function LatencyHelp({ kind }: { kind: keyof typeof latencyHelp }) {
	const { label, measure, calculation } = latencyHelp[kind];

	return (
		<PreviewCard
			trigger="click"
			triggerRender={
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={`Help for ${label}`}
					className="shrink-0 text-muted-foreground hover:text-primary"
				/>
			}
			cardContent={
				<div className="max-w-100 space-y-3 text-sm leading-5">
					<div className="space-y-1">
						<p className="font-semibold text-foreground">What it measures</p>
						<p className="text-muted-foreground">{measure}</p>
					</div>
					<div className="space-y-1">
						<p className="font-semibold text-foreground">How it's calculated</p>
						<p className="text-muted-foreground">{calculation}</p>
					</div>
					<div className="space-y-1">
						<p className="font-semibold text-foreground">Status ranges</p>
						<p className="text-muted-foreground">
							Low: under 300 ms
							<br />
							Elevated: 300 to under 800 ms
							<br />
							High: 800 ms and above
						</p>
					</div>
				</div>
			}
		>
			<RiInfoCardLine className="size-4" aria-hidden="true" />
		</PreviewCard>
	);
}
