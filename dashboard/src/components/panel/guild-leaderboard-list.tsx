import { Card, Table, type TableColumnDef } from "@febkosq8/arc";

import UserDisplay from "@jappan/components/display/UserDisplay";
import type { GuildLeaderboard as GuildLeaderboardData } from "@jappan/handlers/APIHandler";

type LeaderboardEntry = GuildLeaderboardData["entries"][number];

const columns: TableColumnDef<LeaderboardEntry>[] = [
	{
		accessorKey: "rank",
		header: "Rank",
		size: 80,
		filterFn: "includesString",
	},
	{
		accessorKey: "username",
		header: "Member",
		mobileFullWidth: true,
		size: 220,
		filterFn: "includesString",
		cell: ({ row }) => {
			const entry = row.original;
			return (
				<div className="flex min-h-10 items-center">
					<UserDisplay
						id={entry.userId}
						name={entry.username}
						avatarUrl={entry.avatarUrl}
						size="md"
						showId={false}
					/>
				</div>
			);
		},
	},
	{
		accessorKey: "points",
		header: "Points",
		size: 120,
		filterFn: "includesString",
		cell: ({ row }) => (
			<span className="block text-right tabular-nums">{row.original.points.toLocaleString()}</span>
		),
	},
];

export default function GuildLeaderboardList({ leaderboard }: { leaderboard: GuildLeaderboardData }) {
	if (!leaderboard.enabled) {
		return (
			<Card hoverable={false} className="p-5 sm:p-6">
				<p className="text-muted-foreground">Leveling is disabled for this guild.</p>
			</Card>
		);
	}

	if (leaderboard.entries.length === 0) {
		return (
			<Card hoverable={false} className="p-5 sm:p-6">
				<p className="text-muted-foreground">No member activity has been recorded yet.</p>
			</Card>
		);
	}

	return <Table data={leaderboard.entries} columnDef={columns} />;
}
