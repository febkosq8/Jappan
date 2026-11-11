import { Avatar, Card } from "@febkosq8/arc";
import { FaTrophy } from "react-icons/fa";

import type { GuildLeaderboard as GuildLeaderboardData } from "@jappan/handlers/APIHandler";

export default function GuildLeaderboardOverviewPanel({ leaderboard }: { leaderboard: GuildLeaderboardData }) {
	if (!leaderboard.enabled) {
		return (
			<Card hoverable={false} className="p-5 sm:p-6">
				<p className="text-muted-foreground">Leveling is disabled for this guild.</p>
			</Card>
		);
	}

	const entriesByRank = new Map(leaderboard.entries.map((entry) => [entry.rank, entry]));
	const podiumSlots = [
		{ place: 2, entry: entriesByRank.get(2) },
		{ place: 1, entry: entriesByRank.get(1) },
		{ place: 3, entry: entriesByRank.get(3) },
	];
	if (leaderboard.entries.length === 0) {
		return (
			<Card hoverable={false} className="p-5 sm:p-6">
				<p className="text-muted-foreground">No member activity has been recorded yet.</p>
			</Card>
		);
	}

	return (
		<div className="grid items-end gap-3 sm:grid-cols-3">
			{podiumSlots.map(({ place, entry }) =>
				entry ? (
					<Card
						key={place}
						hoverable={false}
						aria-label={`${place}${place === 1 ? "st" : place === 2 ? "nd" : "rd"} place: ${entry.username}, ${entry.points.toLocaleString()} points`}
						className={`flex flex-col items-center gap-3 p-4 text-center ${
							place === 1 ? "border-primary/60 sm:p-5" : ""
						}`}
					>
						<span
							className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
								place === 1
									? "bg-warning/10 text-warning"
									: place === 2
										? "bg-muted text-muted-foreground"
										: "bg-orange-500/10 text-orange-500"
							}`}
						>
							<FaTrophy className="size-4" aria-hidden="true" />
							{place === 1 ? "1st place" : place === 2 ? "2nd place" : "3rd place"}
						</span>
						<Avatar name={entry.username} image={entry.avatarUrl} size="lg" aria-hidden="true" />
						<div className="min-w-0 max-w-full">
							<a
								href={`https://discord.com/users/${encodeURIComponent(entry.userId)}`}
								target="_blank"
								rel="noreferrer"
								className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{entry.username}
							</a>
							<p className="mt-1 text-sm tabular-nums text-muted-foreground">
								{entry.points.toLocaleString()} points
							</p>
						</div>
					</Card>
				) : (
					<div key={place} aria-hidden="true" className="hidden sm:block" />
				),
			)}
		</div>
	);
}
