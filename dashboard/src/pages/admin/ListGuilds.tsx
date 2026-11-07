import { Avatar, Button, DateHandler, Table, TextLink, type TableColumnDef } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";

import APIHandler, { type AdminGuild } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/jappan/AdminRoute";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";

function Unavailable() {
	return <span className="text-muted-foreground">Unavailable</span>;
}

const columns: TableColumnDef<AdminGuild>[] = [
	{
		accessorKey: "name",
		header: "Guild",
		mobileFullWidth: true,
		size: 170,
		filterFn: "includesString",
		cell: ({ row }) => {
			const guild = row.original;
			return (
				<div className="flex items-center gap-2">
					<Avatar name={guild.name} image={guild.icon} size="sm" aria-hidden="true" />
					<span className="min-w-0">
						<TextLink
							href={`/admin/guild/${encodeURIComponent(guild.id)}`}
							text={guild.name}
							title={guild.name}
							target="_self"
							className="block truncate font-medium"
						/>
						<span className="block text-xs text-muted-foreground">{guild.id}</span>
					</span>
				</div>
			);
		},
	},
	{
		id: "membership",
		accessorFn: (guild) => (guild.isActiveMember ? "Yes" : "No"),
		header: "Member",
		size: 100,
		filterSelectOptions: [
			{ value: "Yes", label: "Yes" },
			{ value: "No", label: "No" },
		],
	},
	{
		id: "ownerName",
		accessorFn: (guild) => guild.owner?.username ?? "Unavailable",
		header: "Owner",
		size: 170,
		filterFn: "includesString",
		cell: ({ row }) => {
			const owner = row.original.owner;
			return owner ? (
				<div className="flex items-center gap-2">
					<Avatar name={owner.username} image={owner.avatarUrl} size="sm" aria-hidden="true" />
					<span className="min-w-0">
						<span className="block truncate" title={owner.username}>
							{owner.username}
						</span>
						<span className="block text-xs text-muted-foreground">{owner.userId}</span>
					</span>
				</div>
			) : (
				<Unavailable />
			);
		},
	},
	{
		accessorKey: "memberCount",
		header: "Members",
		filterFn: "includesString",
		cell: ({ row }) =>
			row.original.memberCount === undefined ? <Unavailable /> : row.original.memberCount.toLocaleString(),
	},
	{
		id: "permissions",
		accessorFn: (guild) =>
			guild.hasRequiredPermissions === undefined ? "Unavailable" : guild.hasRequiredPermissions ? "All" : "Some",
		header: "Permission Coverage",
		size: 185,
		filterSelectOptions: [
			{ value: "All", label: "All" },
			{ value: "Some", label: "Some" },
			{ value: "Unavailable", label: "Unavailable" },
		],
		cell: ({ row, getValue }) =>
			row.original.hasRequiredPermissions === undefined ? <Unavailable /> : String(getValue()),
	},
	{
		id: "joined",
		accessorFn: (guild) =>
			guild.joinedTimestamp === undefined
				? "Unavailable"
				: DateHandler.getFormattedTime(guild.joinedTimestamp, "$ISO$\n($RELATIVE$)"),
		header: "Joined",
		size: 185,
		filterFn: "includesString",
		sortingFn: (first, second) => {
			const firstTimestamp = first.original.joinedTimestamp;
			const secondTimestamp = second.original.joinedTimestamp;
			if (firstTimestamp === undefined) return secondTimestamp === undefined ? 0 : 1;
			if (secondTimestamp === undefined) return -1;
			return firstTimestamp - secondTimestamp;
		},
		cell: ({ row }) => {
			const joinedTimestamp = row.original.joinedTimestamp;
			return joinedTimestamp === undefined ? (
				<Unavailable />
			) : (
				<span>
					<span className="block">{DateHandler.getDateTime(joinedTimestamp)}</span>
					<span className="block text-xs text-muted-foreground">
						{DateHandler.getRelativeTime(joinedTimestamp)}
					</span>
				</span>
			);
		},
	},
];

export default function AdminGuilds() {
	document.title = "Admin - List Guilds";
	const guildsQuery = useQuery({
		queryKey: ["admin", "list-guilds"],
		queryFn: APIHandler.getAdminGuilds,
	});

	const accessStatus = accessErrorStatus(guildsQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	let content;
	if (guildsQuery.isPending) {
		content = <LoadingIndicator label="Loading guilds" />;
	} else if (guildsQuery.isError) {
		content = (
			<div role="alert">
				<p>Could not load guilds. Check your access and try again.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void guildsQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (guildsQuery.data.length === 0) {
		content = <p>No stored guilds found.</p>;
	} else {
		content = <Table data={guildsQuery.data} columnDef={columns} />;
	}

	return (
		<main className="mx-auto w-full  px-4 py-10 sm:px-6">
			<h1 className="text-3xl font-bold tracking-tight typography-heading-2">List Guilds</h1>
			{content}
		</main>
	);
}
