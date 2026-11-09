import { Avatar, Button, Table, TextLink, type TableColumnDef } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import APIHandler, { type UserGuild } from "@jappan/handlers/APIHandler";
import { AccessRedirect } from "@jappan/components/AdminRoute";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

function Unavailable() {
	return <span className="text-muted-foreground">Unavailable</span>;
}

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not load guilds. Please try again.";
}

const columns: TableColumnDef<UserGuild>[] = [
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
							href={`/guild/${encodeURIComponent(guild.id)}`}
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
		id: "ownerName",
		accessorFn: (guild) => guild.owner?.username,
		header: "Owner",
		size: 170,
		filterFn: (row, columnId, filterValue) =>
			String(row.getValue(columnId) ?? "Unavailable")
				.toLowerCase()
				.includes(String(filterValue).toLowerCase()),
		sortingFn: "alphanumeric",
		sortUndefined: "last",
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
		id: "permissions",
		accessorFn: (guild) =>
			guild.hasRequiredPermissions === undefined ? undefined : guild.hasRequiredPermissions ? "All" : "Some",
		header: "Permission Coverage",
		size: 185,
		filterSelectOptions: [
			{ value: "All", label: "All" },
			{ value: "Some", label: "Some" },
			{ value: "Unavailable", label: "Unavailable" },
		],
		filterFn: (row, columnId, filterValue) => (row.getValue(columnId) ?? "Unavailable") === filterValue,
		sortingFn: "alphanumeric",
		sortUndefined: "last",
		cell: ({ row, getValue }) =>
			row.original.hasRequiredPermissions === undefined ? <Unavailable /> : String(getValue()),
	},
];

export default function UserListGuilds() {
	useDocumentTitle(formatTitle("My Guilds"));
	const guildsQuery = useQuery({
		queryKey: ["user", "list-guilds"],
		queryFn: APIHandler.getUserGuilds,
	});

	const isUnauthorized = axios.isAxiosError(guildsQuery.error) && guildsQuery.error.response?.status === 401;
	if (isUnauthorized) return <AccessRedirect status={401} />;

	let content;
	if (guildsQuery.isPending) {
		content = <LoadingIndicator label="Loading guilds" />;
	} else if (guildsQuery.isError) {
		content = (
			<div role="alert" className="space-y-2">
				<p>{getErrorMessage(guildsQuery.error)}</p>
				<Button size="sm" variant="outline-primary" onClick={() => void guildsQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (guildsQuery.data.length === 0) {
		content = (
			<p className="text-muted-foreground">
				No guilds found. Make sure Jappan is in your server and you have Manage Server permission.
			</p>
		);
	} else {
		content = <Table data={guildsQuery.data} columnDef={columns} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<h1 className="mb-2 typography-heading-2 text-3xl font-bold tracking-tight">My Guilds</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Guilds where you have Manage Server permission and Jappan is a member.
			</p>
			{content}
		</main>
	);
}
