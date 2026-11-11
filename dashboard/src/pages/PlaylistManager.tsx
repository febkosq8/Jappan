import {
	Button,
	Card,
	DoubleClickButton,
	Input,
	LabelField,
	Switch,
	Table,
	Tag,
	TextLink,
	type TableColumnDef,
} from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type SubmitEvent } from "react";
import { FiEdit2, FiExternalLink, FiMusic, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { toast } from "sonner";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type UserPlaylist } from "@jappan/handlers/APIHandler";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const queryKey = ["user", "playlists"] as const;
const MAX_PLAYLIST_NAME_LENGTH = 100;
const MAX_PLAYLIST_QUERY_LENGTH = 2000;
const CONFIRMATION_DURATION_MS = 2000;

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not manage saved playlists. Please try again.";
}

function getHttpUrl(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

export default function PlaylistManager() {
	const queryClient = useQueryClient();
	const playlistsQuery = useQuery({
		queryKey,
		queryFn: APIHandler.getUserPlaylists,
		retry: false,
	});
	const [listname, setListname] = useState("");
	const [query, setQuery] = useState("");
	const [shuffle, setShuffle] = useState(false);
	const [loop, setLoop] = useState(false);
	const [editingName, setEditingName] = useState<string | null>(null);

	useDocumentTitle(formatTitle("My playlists"));

	const saveMutation = useMutation({
		mutationFn: (playlist: UserPlaylist) => {
			const promise = APIHandler.saveUserPlaylist(playlist);
			toast.promise(promise, {
				loading: `Checking and saving "${playlist.listname}"…`,
				success: `Playlist "${playlist.listname}" saved.`,
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async () => {
			setListname("");
			setQuery("");
			setShuffle(false);
			setLoop(false);
			setEditingName(null);
			await queryClient.invalidateQueries({ queryKey });
		},
	});
	const removeMutation = useMutation({
		mutationFn: (removedName: string) => {
			const promise = APIHandler.removeUserPlaylist(removedName);
			toast.promise(promise, {
				loading: `Removing "${removedName}"…`,
				success: `Playlist "${removedName}" removed.`,
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async (_result, removedName) => {
			if (editingName?.toLowerCase() === removedName.toLowerCase()) {
				clearForm();
			}
			await queryClient.invalidateQueries({ queryKey });
		},
	});
	const busy = saveMutation.isPending || removeMutation.isPending;
	const canSubmit =
		!busy &&
		listname.trim().length > 0 &&
		listname.trim().length <= MAX_PLAYLIST_NAME_LENGTH &&
		query.trim().length > 0 &&
		query.trim().length <= MAX_PLAYLIST_QUERY_LENGTH;

	function clearForm() {
		setListname("");
		setQuery("");
		setShuffle(false);
		setLoop(false);
		setEditingName(null);
	}

	function editPlaylist(playlist: UserPlaylist) {
		setEditingName(playlist.listname);
		setListname(playlist.listname);
		setQuery(playlist.query);
		setShuffle(playlist.shuffle);
		setLoop(playlist.loop);
		document.getElementById("playlist-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canSubmit) return;
		saveMutation.mutate({ listname: listname.trim(), query: query.trim(), shuffle, loop });
	}

	const columns: TableColumnDef<UserPlaylist>[] = [
		{
			accessorKey: "listname",
			header: "List name",
			mobileFullWidth: true,
			size: 190,
			filterFn: "includesString",
			sortingFn: "alphanumeric",
			cell: ({ row }) => (
				<span className="block truncate font-medium" title={row.original.listname}>
					{row.original.listname}
				</span>
			),
		},
		{
			accessorKey: "query",
			header: "Search query or playlist URL",
			size: 340,
			filterFn: "includesString",
			sortingFn: "alphanumeric",
			cell: ({ row }) => {
				const sourceUrl = getHttpUrl(row.original.query);
				return sourceUrl ? (
					<span className="inline-flex min-w-0 items-center gap-1">
						<TextLink
							href={sourceUrl}
							text={row.original.query}
							title={row.original.query}
							className="block truncate"
						/>
						<FiExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
					</span>
				) : (
					<span className="block truncate" title={row.original.query}>
						{row.original.query}
					</span>
				);
			},
		},
		{
			id: "shuffle",
			accessorFn: (playlist) => (playlist.shuffle ? "On" : "Off"),
			header: "Shuffle",
			size: 110,
			filterSelectOptions: [
				{ value: "On", label: "On" },
				{ value: "Off", label: "Off" },
			],
			sortingFn: "alphanumeric",
			cell: ({ row }) => (row.original.shuffle ? "On" : "Off"),
		},
		{
			id: "loop",
			accessorFn: (playlist) => (playlist.loop ? "On" : "Off"),
			header: "Loop",
			size: 100,
			filterSelectOptions: [
				{ value: "On", label: "On" },
				{ value: "Off", label: "Off" },
			],
			sortingFn: "alphanumeric",
			cell: ({ row }) => (row.original.loop ? "On" : "Off"),
		},
		{
			id: "actions",
			accessorFn: (playlist) => playlist.listname,
			header: "Actions",
			size: 205,
			enableSorting: false,
			enableColumnFilter: false,
			filterFn: false,
			cell: ({ row }) => (
				<div className="flex items-center gap-2 py-1">
					<Button
						type="button"
						size="sm"
						variant="outline-secondary"
						disabled={busy}
						aria-label={`Edit ${row.original.listname}`}
						onClick={() => editPlaylist(row.original)}
					>
						<FiEdit2 className="mr-1" aria-hidden="true" />
						Edit
					</Button>
					<DoubleClickButton
						type="button"
						className="w-fit whitespace-nowrap"
						size="sm"
						variant="outline-destructive"
						feedbackVariant="destructive"
						feedbackContent="Confirm?"
						doubleClickMsDuration={CONFIRMATION_DURATION_MS}
						disabled={busy}
						aria-label={`Remove ${row.original.listname}`}
						onDoubleClick={() => removeMutation.mutate(row.original.listname)}
					>
						<span className="inline-flex items-center gap-1 whitespace-nowrap">
							<FiTrash2 className="size-3 shrink-0" aria-hidden="true" />
							<span>Remove</span>
						</span>
					</DoubleClickButton>
				</div>
			),
		},
	];

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
			<header className="mb-8">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-3xl font-bold tracking-tight">My playlists</h1>
					{playlistsQuery.data && (
						<Tag variant="secondary" size="sm">
							{playlistsQuery.data.length} saved
						</Tag>
					)}
				</div>
				<p className="mt-2 max-w-3xl text-muted-foreground">
					Save a search or playlist link once, then use its name with <code>/play</code> or when adding music
					to a player queue. These playlists belong to your account and work across servers.
				</p>
			</header>

			<Card id="playlist-form" hoverable={false} className="mb-8 scroll-mt-24 rounded-md border-border">
				<Card.Content className="p-5! sm:p-6!">
					<div className="mb-5 flex items-start gap-3">
						<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
							{editingName ? (
								<FiEdit2 className="size-5" aria-hidden="true" />
							) : (
								<FiMusic className="size-5" aria-hidden="true" />
							)}
						</span>
						<div>
							<h2 className="text-lg font-semibold">
								{editingName ? `Edit “${editingName}”` : "Save a playlist"}
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								{editingName
									? "Change the source or playback options, then save your changes."
									: "Give a search or playlist link a name you’ll remember."}
							</p>
						</div>
					</div>
					<form onSubmit={submit} className="mt-5 space-y-4">
						<fieldset disabled={busy} className="space-y-4">
							<div className="grid gap-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.6fr)]">
								<div>
									<LabelField
										id="playlist-name"
										label="Playlist name"
										className="mb-1"
										help={
											editingName
												? "Playlist names can't be changed while editing."
												: "Up to 100 characters. Saving a name that already exists updates that playlist."
										}
									/>
									<Input
										id="playlist-name"
										value={listname}
										onChange={(event) => setListname(event.target.value)}
										disabled={busy || editingName !== null}
										maxLength={MAX_PLAYLIST_NAME_LENGTH}
										autoComplete="off"
										placeholder="e.g. Morning mix"
										className="w-full"
										required
									/>
								</div>
								<div>
									<LabelField
										id="playlist-query"
										label="Search or playlist link"
										className="mb-1"
										help="Jappan checks your search or link before saving, so you’ll know if it can find tracks."
									/>
									<Input
										id="playlist-query"
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										maxLength={MAX_PLAYLIST_QUERY_LENGTH}
										autoComplete="off"
										placeholder="Search for tracks or paste a playlist link"
										className="w-full"
										required
									/>
								</div>
							</div>
						</fieldset>
						<div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
							<div className="flex flex-wrap gap-x-6 gap-y-3">
								<label className="flex items-center gap-3">
									<Switch checked={shuffle} onChange={setShuffle} disabled={busy} />
									<span className="font-medium">Shuffle on playback</span>
								</label>
								<label className="flex items-center gap-3">
									<Switch checked={loop} onChange={setLoop} disabled={busy} />
									<span className="font-medium">Loop playlist</span>
								</label>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button type="submit" disabled={!canSubmit}>
									{editingName ? (
										<FiEdit2 className="mr-1" aria-hidden="true" />
									) : (
										<FiPlus className="mr-1" aria-hidden="true" />
									)}
									{saveMutation.isPending
										? "Checking and saving…"
										: editingName
											? "Save changes"
											: "Save playlist"}
								</Button>
								{editingName && (
									<Button
										type="button"
										variant="outline-secondary"
										disabled={busy}
										onClick={clearForm}
									>
										<FiX className="mr-1" aria-hidden="true" />
										Cancel
									</Button>
								)}
							</div>
						</div>
					</form>
				</Card.Content>
			</Card>

			<section aria-labelledby="saved-playlists-heading">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
					<h2 id="saved-playlists-heading" className="flex items-center gap-2 text-xl font-semibold">
						<FiMusic className="size-5 text-muted-foreground" aria-hidden="true" />
						Saved playlists
					</h2>
					{playlistsQuery.data && playlistsQuery.data.length > 0 && (
						<p className="text-sm text-muted-foreground">Search, filter, or sort your playlists below.</p>
					)}
				</div>
				{playlistsQuery.isPending ? (
					<LoadingIndicator label="Loading saved playlists" />
				) : playlistsQuery.isError ? (
					<Card hoverable={false} className="rounded-md border-border p-5">
						<p role="alert" className="text-sm text-destructive">
							{getErrorMessage(playlistsQuery.error)}
						</p>
						<Button
							size="sm"
							variant="outline-primary"
							className="mt-3"
							disabled={playlistsQuery.isFetching}
							onClick={() => void playlistsQuery.refetch()}
						>
							Retry
						</Button>
					</Card>
				) : playlistsQuery.data.length === 0 ? (
					<Card hoverable={false} className="rounded-md border-border p-5 sm:p-6">
						<div className="flex flex-col items-center text-center">
							<span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<FiMusic className="size-6" aria-hidden="true" />
							</span>
							<h3 className="mt-3 font-semibold">Your playlists will show up here</h3>
							<p className="mt-1 max-w-md text-sm text-muted-foreground">
								Save a search or playlist link above. You can update or remove it at any time.
							</p>
						</div>
					</Card>
				) : (
					<Table
						data={[...playlistsQuery.data].sort((first, second) =>
							first.listname.localeCompare(second.listname, undefined, { sensitivity: "base" }),
						)}
						columnDef={columns}
						pageSize={10}
					/>
				)}
			</section>
		</main>
	);
}
