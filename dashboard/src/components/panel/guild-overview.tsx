import { Card, DateHandler } from "@febkosq8/arc";
import { Link } from "react-router-dom";
import { FiBarChart2 } from "react-icons/fi";

import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import type { AdminGuildDetails, UserGuildDetails } from "@jappan/handlers/APIHandler";
import GuildCommandDeployment from "@jappan/components/guild/GuildCommandDeployment";
import GuildDetail from "@jappan/components/panel/guild-detail";
import GuildSectionLink from "@jappan/components/panel/guild-section-link";

export default function GuildOverview({ guild }: { guild: AdminGuildDetails | UserGuildDetails }) {
	return (
		<div className="space-y-4">
			<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Guild overview <GuildSectionLink id="guild-overview" label="guild overview" />
				</h2>
				<dl className="mt-5 grid gap-3 sm:grid-cols-2">
					{"hasRequiredPermissions" in guild && guild.hasRequiredPermissions !== undefined && (
						<GuildDetail label="Required permissions">
							{guild.hasRequiredPermissions ? (
								<span className="text-success">All granted</span>
							) : (
								<span className="text-destructive">Some missing</span>
							)}
						</GuildDetail>
					)}
					{"owner" in guild && guild.owner && (
						<GuildDetail label="Owner">
							<UserDisplay
								id={guild.owner.userId}
								name={guild.owner.username}
								avatarUrl={guild.owner.avatarUrl}
							/>
						</GuildDetail>
					)}
					{"isActiveMember" in guild && (
						<GuildDetail label="Bot membership">{guild.isActiveMember ? "Active" : "Inactive"}</GuildDetail>
					)}
					{"description" in guild && guild.description !== undefined && (
						<GuildDetail label="Description">{guild.description}</GuildDetail>
					)}
					{"memberCount" in guild && guild.memberCount !== undefined && (
						<GuildDetail label="Members">{guild.memberCount.toLocaleString()}</GuildDetail>
					)}
					{"channelCount" in guild && guild.channelCount !== undefined && (
						<GuildDetail label="Channels">{guild.channelCount.toLocaleString()}</GuildDetail>
					)}
					{"createdTimestampMs" in guild && guild.createdTimestampMs !== undefined && (
						<GuildDateDetail label="Created" timestamp={guild.createdTimestampMs} />
					)}
					{"joinedTimestampMs" in guild && guild.joinedTimestampMs !== undefined && (
						<GuildDateDetail label="Joined" timestamp={guild.joinedTimestampMs} />
					)}
					{"discoveredTimestampMs" in guild && guild.discoveredTimestampMs !== null && (
						<GuildDateDetail label="Discovered" timestamp={guild.discoveredTimestampMs} />
					)}
					{"guildCommandDeploymentState" in guild && guild.guildCommandDeploymentState !== undefined && (
						<GuildDetail label="Guild commands">
							<GuildCommandDeployment deployment={guild.guildCommandDeploymentState} />
						</GuildDetail>
					)}
					{"systemChannel" in guild && guild.systemChannel !== undefined && (
						<GuildDetail label="System channel">
							{guild.systemChannel === null ? (
								"None"
							) : (
								<ChannelDisplay guildId={guild.id} {...guild.systemChannel} />
							)}
						</GuildDetail>
					)}
				</dl>
				<section
					aria-labelledby="guild-leaderboard-title"
					className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div className="flex min-w-0 items-center gap-3">
						<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
							<FiBarChart2 className="size-5" aria-hidden="true" />
						</span>
						<div className="min-w-0">
							<h3 id="guild-leaderboard-title" className="font-semibold">
								Leveling leaderboard
							</h3>
							<p className="text-sm text-muted-foreground">
								View member activity points and the configured reward.
							</p>
						</div>
					</div>
					<Link
						to={`/guild/${encodeURIComponent(guild.id)}/leaderboard`}
						className="inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75 sm:ml-auto"
					>
						View leaderboard
					</Link>
				</section>
			</Card>
		</div>
	);
}

function GuildDateDetail({ label, timestamp }: { label: string; timestamp: number }) {
	return (
		<GuildDetail label={label}>
			<span className="block">{DateHandler.getDateTime(timestamp)}</span>
			<span className="text-sm text-muted-foreground">{DateHandler.getRelativeTime(timestamp)}</span>
		</GuildDetail>
	);
}
