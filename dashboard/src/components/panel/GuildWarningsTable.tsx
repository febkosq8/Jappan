import { Button, Card, Table, type TableColumnDef } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";

import UserDisplay from "@jappan/components/display/UserDisplay";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type WarnedMember } from "@jappan/handlers/APIHandler";

function getColumns({
	onSelectMember,
	disabled,
}: {
	onSelectMember: (userId: string) => void;
	disabled: boolean;
}): TableColumnDef<WarnedMember>[] {
	return [
		{
			accessorKey: "username",
			header: "User",
			mobileFullWidth: true,
			size: 260,
			filterFn: "includesString",
			cell: ({ row }) => (
				<UserDisplay
					id={row.original.userId}
					name={row.original.username}
					avatarUrl={row.original.avatarUrl}
					size="md"
				/>
			),
		},
		{
			accessorKey: "warningCount",
			header: "Warnings",
			size: 120,
			filterFn: "includesString",
			cell: ({ row }) => (
				<Button
					type="button"
					size="sm"
					variant="outline-primary"
					className="tabular-nums"
					disabled={disabled}
					aria-label={`View ${row.original.username}'s ${row.original.warningCount} warning(s)`}
					onClick={() => onSelectMember(row.original.userId)}
				>
					{row.original.warningCount.toLocaleString()}
				</Button>
			),
		},
	];
}

export default function GuildWarningsTable({
	guildId,
	active,
	isActiveMember,
	onSelectMember,
	disabled = false,
}: {
	guildId: string;
	active: boolean;
	isActiveMember: boolean;
	onSelectMember: (userId: string) => void;
	disabled?: boolean;
}) {
	const [loadedGuildId, setLoadedGuildId] = useState<string | null>(null);
	const loadRequested = loadedGuildId === guildId;
	const warningsQuery = useQuery({
		queryKey: ["user", "guild", guildId, "warnings", "list"],
		queryFn: () => APIHandler.getGuildWarnedMembers(guildId),
		enabled: active && isActiveMember && loadRequested,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const errorMessage =
		axios.isAxiosError<{ error?: string }>(warningsQuery.error) &&
		typeof warningsQuery.error.response?.data?.error === "string"
			? warningsQuery.error.response.data.error
			: "Could not load warned users. Please try again.";

	return (
		<Card hoverable={false} className="p-5 sm:p-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">Users with warnings</h2>
				{warningsQuery.isFetching && (
					<LoadingIndicator label="Loading warned users" inline size={80} rows={1} columns={5} />
				)}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Ordered by warning count. Select a count to review that member's warning history above.
			</p>
			{!loadRequested && (
				<Button
					type="button"
					size="sm"
					variant="outline-primary"
					className="mt-3"
					disabled={!active || !isActiveMember}
					onClick={() => setLoadedGuildId(guildId)}
				>
					Load warnings
				</Button>
			)}
			<div className="mt-4">
				{!isActiveMember ? (
					<p className="text-sm text-muted-foreground">The bot must be a guild member to load warnings.</p>
				) : !loadRequested ? (
					<p className="text-sm text-muted-foreground">Load warnings to view users with a warning count.</p>
				) : warningsQuery.isError ? (
					<div role="alert" className="space-y-2">
						<p className="text-sm text-destructive">{errorMessage}</p>
						<Button
							size="sm"
							variant="outline-primary"
							disabled={warningsQuery.isFetching}
							onClick={() => void warningsQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : warningsQuery.isSuccess ? (
					warningsQuery.data.length > 0 ? (
						<Table
							data={warningsQuery.data}
							columnDef={getColumns({ onSelectMember, disabled: disabled || !active || !isActiveMember })}
						/>
					) : (
						<p className="text-sm text-muted-foreground">No users currently have warnings.</p>
					)
				) : null}
			</div>
		</Card>
	);
}
