import { Avatar, Button, Card, Dropdown, PillLink, Tag } from "@febkosq8/arc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FiExternalLink, FiHeadphones, FiLink, FiPlay, FiRadio } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import TrackInput from "@jappan/components/player/TrackInput";
import APIHandler from "@jappan/handlers/APIHandler";
import { useSessionQuery, useSignIn } from "@jappan/handlers/auth";
import getErrorMessage from "@jappan/helpers/getErrorMessage";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const guildsQueryKey = ["user", "guilds", "member"] as const;

const steps = [
	{
		number: "01",
		title: "Join a voice channel",
		description: "In a server with Jappan, join the voice channel where you want the music to play.",
		icon: FiHeadphones,
	},
	{
		number: "02",
		title: "Choose what to play",
		description: "Select that server and enter a track, playlist, or one of your saved playlist names below.",
		icon: FiPlay,
	},
	{
		number: "03",
		title: "Control playback",
		description: "The Web Player opens as soon as playback starts. Audio continues in your Discord voice channel.",
		icon: FiLink,
	},
];

export default function PlayerLanding() {
	const navigate = useNavigate();
	const sessionQuery = useSessionQuery();
	const { signIn, busy: signingIn } = useSignIn();
	const [guildId, setGuildId] = useState("");
	const signedIn = Boolean(sessionQuery.data);
	const guildsQuery = useQuery({
		queryKey: guildsQueryKey,
		queryFn: APIHandler.getUserMemberGuilds,
		enabled: signedIn,
		retry: false,
	});
	const startMutation = useMutation({
		mutationFn: APIHandler.startPlayerSession,
		onSuccess: ({ sessionId, skippedTracks }) => {
			if (skippedTracks > 0) {
				toast.warning(
					`${skippedTracks} playlist track${skippedTracks === 1 ? " was" : "s were"} left out because the queue is full.`,
				);
			}
			navigate(`/player/${encodeURIComponent(sessionId)}`);
		},
		onError: (error: unknown) => toast.error(getErrorMessage(error, "Could not start playback. Please try again.")),
	});
	const guilds = guildsQuery.data ?? [];
	const serverLoading = sessionQuery.isPending || (signedIn && guildsQuery.isPending);
	const serverSelectDisabled =
		serverLoading || sessionQuery.isError || !signedIn || guildsQuery.isError || guilds.length === 0;
	const serverOptions =
		guilds.length > 0
			? guilds.map((guild) => ({ key: guild.id, label: guild.name }))
			: [
					{
						key: "",
						label: sessionQuery.isPending
							? "Checking sign-in…"
							: sessionQuery.isError
								? "Could not check sign-in"
								: !signedIn
									? "Sign in to load servers"
									: guildsQuery.isPending
										? "Loading servers…"
										: guildsQuery.isError
											? "Could not load servers"
											: "No available servers",
					},
				];
	const trackInputDisabled = startMutation.isPending;

	useEffect(() => {
		if (guildId && !guilds.some((guild) => guild.id === guildId)) {
			setGuildId("");
		}
	}, [guildId, guilds]);

	useDocumentTitle(formatTitle("Web Player"));

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<header className="mb-6 max-w-3xl">
				<Tag
					variant="outline"
					className="mb-4 gap-2 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
				>
					<FiRadio aria-hidden="true" />
					Start and control playback
				</Tag>
				<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Start a music session</h1>
				<p className="mt-2 text-muted-foreground">
					Choose a server and track from the dashboard. Jappan joins the voice channel you are already in.
				</p>
			</header>

			<section className="mb-6 space-y-4">
				<p className="text-muted-foreground">
					Join the voice channel where you want to listen, then start playback. Jappan will find you there and
					join you.
				</p>
				<TrackInput
					sessionId={sessionQuery.data?.session.id ?? "start"}
					disabled={trackInputDisabled}
					submitDisabled={!guildId}
					adding={startMutation.isPending}
					onAdd={(query) => {
						if (guildId && !trackInputDisabled) {
							startMutation.mutate({ guildId, query });
						}
					}}
					loadSuggestions={APIHandler.getPlayerSuggestions}
					title="Start playback"
					submitLabel="Start playback"
					pendingLabel="Starting playback…"
					submitIcon={<FiPlay className="mr-1" aria-hidden="true" />}
					inputLabel="Track or playlist"
					inputPlaceholder="Search tracks, playlists, or saved playlists"
				>
					<div>
						<div className="mb-1 flex h-5 items-center gap-2">
							<label
								htmlFor="player-start-guild"
								className="block text-sm font-medium text-foreground"
							>
								Server
							</label>
							{serverLoading && (
								<LoadingIndicator
									label={sessionQuery.isPending ? "Checking sign-in" : "Loading servers"}
									inline
									size={60}
									rows={1}
									columns={5}
								/>
							)}
						</div>
						<Dropdown
							id="player-start-guild"
							value={guildId}
							onChange={(item) => setGuildId(item ? String(item.key) : "")}
							items={serverOptions}
							placeholder="Select a server"
							renderValue={(item) => {
								const guild = guilds.find((entry) => entry.id === String(item.key));
								return guild ? (
									<Avatar name={guild.name} image={guild.icon} size="xs" aria-hidden="true" />
								) : null;
							}}
							renderItem={(item) => {
								const guild = guilds.find((entry) => entry.id === String(item.key));
								if (!guild) return item.label;
								return (
									<span className="flex min-w-0 items-center gap-2">
										<Avatar name={guild.name} image={guild.icon} size="xs" aria-hidden="true" />
										<span className="min-w-0 truncate">{guild.name}</span>
									</span>
								);
							}}
							disabled={serverSelectDisabled || startMutation.isPending}
							className="w-full"
						/>
						{sessionQuery.isError && (
							<p role="alert" className="mt-1 text-sm text-destructive">
								Could not check your sign-in. Refresh the page and try again.
							</p>
						)}
						{sessionQuery.isSuccess && !signedIn && (
							<div className="mt-2">
								<p className="mb-2 text-sm text-muted-foreground">
									Sign in with Discord to start a session.
								</p>
								<Button type="button" onClick={() => void signIn()} disabled={signingIn} size="sm">
									{signingIn ? "Opening Discord…" : "Sign in with Discord"}
								</Button>
							</div>
						)}
						{signedIn && guildsQuery.isError && (
							<p role="alert" className="mt-1 text-sm text-destructive">
								{getErrorMessage(guildsQuery.error, "Could not load your servers. Please try again.")}
							</p>
						)}
						{signedIn && guildsQuery.isSuccess && guilds.length === 0 && (
							<p className="mt-1 text-sm text-muted-foreground">
								There are no servers available where both you and Jappan are members.
							</p>
						)}
					</div>
				</TrackInput>
			</section>

			<ol className="grid gap-4 md:grid-cols-3">
				{steps.map(({ number, title, description, icon: Icon }) => (
					<li key={number}>
						<Card className="h-full p-5 sm:p-6">
							<div className="flex items-center justify-between gap-3">
								<span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
									<Icon className="size-5" aria-hidden="true" />
								</span>
								<span className="text-sm font-semibold tabular-nums text-muted-foreground">
									{number}
								</span>
							</div>
							<h2 className="mt-5 text-lg font-semibold">{title}</h2>
							<p className="mt-2 leading-6 text-muted-foreground">{description}</p>
						</Card>
					</li>
				))}
			</ol>

			<Card className="mx-auto mt-6 max-w-3xl p-5 sm:p-6">
				<h2 className="font-semibold">About Web Player sessions</h2>
				<p className="mt-2 leading-6 text-muted-foreground whitespace-pre-wrap">
					{`Each link is tied to one active Jappan session.\nYou must be a member of the server and in the active voice channel to control playback.\nThe link stops working when the session ends.`}
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					<PillLink href="/commands" variant="outline-primary" size="sm" className="gap-2">
						<FiExternalLink aria-hidden="true" />
						View all commands
					</PillLink>
				</div>
			</Card>
		</main>
	);
}
