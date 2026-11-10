import { Card, DateHandler } from "@febkosq8/arc";
import { Link } from "react-router-dom";

import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import GuildDisplay from "@jappan/components/display/GuildDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import type { AdminGuildDetails, UserGuildDetails } from "@jappan/handlers/APIHandler";
import GuildCommandDeployment from "@jappan/components/guild/GuildCommandDeployment";
import GuildDetail from "@jappan/components/panel/guild-detail";
import GuildSectionLink from "@jappan/components/panel/guild-section-link";

export default function GuildOverview({ guild }: { guild: AdminGuildDetails | UserGuildDetails }) {
	const leaderboardPath = "discoveredTimestampMs" in guild ? "/admin/leaderboard" : "/leaderboard";
	return (
		<div className="space-y-4">
			<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Guild overview <GuildSectionLink id="guild-overview" label="guild overview" />
				</h2>
				<div className="mt-4">
					<GuildDisplay id={guild.id} name={guild.name} icon={guild.icon} />
				</div>
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
			</Card>
			<Card
				hoverable={false}
				className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
			>
				<div>
					<h2 className="text-lg font-semibold">Leveling leaderboard</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						View member activity points and the configured leveling reward.
					</p>
				</div>
				<Link
					to={`${leaderboardPath}/${encodeURIComponent(guild.id)}`}
					className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75"
				>
					View leaderboard
				</Link>
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
