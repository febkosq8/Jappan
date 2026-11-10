import { Card } from "@febkosq8/arc";

import RoleDisplay from "@jappan/components/display/RoleDisplay";
import type { GuildLeaderboard as GuildLeaderboardData } from "@jappan/handlers/APIHandler";

export default function GuildLeaderboardRewards({ leaderboard }: { leaderboard: GuildLeaderboardData }) {
	if (!leaderboard.reward) {
		return (
			<Card hoverable={false} className="p-5 sm:p-6">
				<p className="text-muted-foreground">No reward has been configured yet.</p>
			</Card>
		);
	}

	return (
		<Card hoverable={false} className="p-5 sm:p-6">
			<h2 className="text-lg font-semibold">Leveling reward</h2>
			<dl className="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-muted-foreground">Reward role</dt>
					<dd className="mt-1">
						<RoleDisplay id={leaderboard.reward.role.id} name={leaderboard.reward.role.name} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-muted-foreground">Points required</dt>
					<dd className="mt-1 font-medium">{leaderboard.reward.threshold.toLocaleString()} points</dd>
				</div>
			</dl>
		</Card>
	);
}
