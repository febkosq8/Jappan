import {
	Button,
	Card,
	DateHandler,
	DoubleClickButton,
	Input,
	LabelField,
	PillLink,
	Select,
	Tabs,
	TabsList,
	TabsPanel,
	TabsTab,
} from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { FiArrowLeft, FiCopy } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, {
	type AdminGuildInvite,
	type AdminGuildChannel,
	type AdminGuildCommandDeploymentResult,
	type AdminGuildDetails,
	type AdminGuildMessageResult,
} from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import ServicePreferencesEditor from "@jappan/components/guild/ServicePreferencesEditor";
import {
	guildIdPattern,
	GuildLookup,
	GuildSectionLink,
	GuildOverview,
	BotPermissionsPanel,
	CommandPermissionsPanel,
} from "@jappan/components/guild/panels";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";
import { CONFIRM_CLICK_MS } from "@jappan/helpers/confirmClick";

const guildSections = [
	{ id: "guild-overview", label: "Overview" },
	{ id: "admin-actions", label: "Admin actions" },
	{ id: "guild-channels", label: "Channels" },
	{ id: "service-preferences", label: "Service Preferences" },
	{ id: "bot-permissions", label: "Bot permissions" },
	{ id: "command-permissions", label: "Command permissions" },
];

const readSectionFromHash = () => {
	const id = window.location.hash.slice(1);
	return guildSections.some((section) => section.id === id) ? id : guildSections[0].id;
};

function ChannelGroupList({ guildId, channels }: { guildId: string; channels: AdminGuildChannel[] }) {
	const categoryType = 4;
	const categories = channels.filter((channel) => channel.type === categoryType);
	const categoryIds = new Set(categories.map((category) => category.id));
	const childrenByParent = new Map<string, AdminGuildChannel[]>();
	const uncategorized: AdminGuildChannel[] = [];
	for (const channel of channels) {
		if (channel.type === categoryType) continue;
		if (!channel.parent) {
			uncategorized.push(channel);
		} else {
			const children = childrenByParent.get(channel.parent.id) ?? [];
			children.push(channel);
			childrenByParent.set(channel.parent.id, children);
		}
	}
	const missingCategories = [...childrenByParent.entries()].filter(([id]) => !categoryIds.has(id));
	const groups = [
		...(uncategorized.length
			? [
					{
						key: "uncategorized",
						name: "No parent category",
						categoryId: null,
						unavailable: false,
						createdTimestampMs: null,
						channels: uncategorized,
					},
				]
			: []),
		...categories.map((category) => ({
			key: category.id,
			name: category.name,
			categoryId: category.id,
			unavailable: false,
			createdTimestampMs: category.createdTimestampMs,
			channels: childrenByParent.get(category.id) ?? [],
		})),
		...missingCategories.map(([id, children]) => ({
			key: id,
			name: children[0]?.parent?.name ?? "Unavailable category",
			categoryId: id,
			unavailable: true,
			createdTimestampMs: null,
			channels: children,
		})),
	];
	return (
		<div className="mt-4 space-y-4">
			{groups.map((group) => (
				<Card
					key={group.key}
					hoverable={false}
					role="region"
					aria-label={group.name}
					className="min-w-0 rounded-md border-border p-3"
				>
					<div className="flex items-center justify-between gap-2">
						<h3 className="wrap-break-word font-semibold">{group.name}</h3>
						<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
							{group.channels.length} {group.channels.length === 1 ? "channel" : "channels"}
						</span>
					</div>
					{group.categoryId && (
						<p className="break-all text-xs text-muted-foreground">
							{group.unavailable ? "Category unavailable · " : ""}
							{group.categoryId}
						</p>
					)}
					{group.createdTimestampMs !== null && (
						<p className="mt-1 text-sm text-muted-foreground">
							Created: {DateHandler.getDateTime(group.createdTimestampMs)} (
							{DateHandler.getRelativeTime(group.createdTimestampMs)})
						</p>
					)}
					{group.channels.length === 0 ? (
						<p className="mt-2 text-sm text-muted-foreground">No channels in this category.</p>
					) : (
						<ul className="mt-3 grid gap-3 sm:grid-cols-2">
							{group.channels.map((channel) => (
								<li key={channel.id}>
									<Card hoverable={false} className="h-full min-w-0 rounded-md border-border p-3">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div className="min-w-0 wrap-break-word">
												<ChannelDisplay guildId={guildId} id={channel.id} name={channel.name} />
											</div>
											{(channel.nsfw ||
												(channel.rateLimitPerUser != null && channel.rateLimitPerUser > 0) ||
												(channel.userLimit !== undefined && channel.userLimit > 0)) && (
												<div className="ml-auto flex flex-wrap justify-end gap-1">
													{channel.nsfw && (
														<span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-medium text-foreground">
															NSFW
														</span>
													)}
													{channel.rateLimitPerUser != null &&
														channel.rateLimitPerUser > 0 && (
															<span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
																Slowmode:{" "}
																{DateHandler.formatDuration(channel.rateLimitPerUser)}
															</span>
														)}
													{channel.userLimit !== undefined && channel.userLimit > 0 && (
														<span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
															User limit: {channel.userLimit}
														</span>
													)}
												</div>
											)}
										</div>
										<p className="break-all text-xs text-muted-foreground">{channel.id}</p>
										<dl className="mt-2 text-sm">
											<div className="flex flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Type:</dt>
												<dd>{channel.typeName.replace(/([a-z])([A-Z])/g, "$1 $2")}</dd>
											</div>
											<div className="flex flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Can send message:</dt>
												<dd>{channel.canSendMessage ? "Yes" : "No"}</dd>
											</div>
											<div className="flex flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Created:</dt>
												<dd>
													{DateHandler.getDateTime(channel.createdTimestampMs)}{" "}
													<span className="text-muted-foreground">
														({DateHandler.getRelativeTime(channel.createdTimestampMs)})
													</span>
												</dd>
											</div>
											{channel.topic && (
												<div>
													<dt className="text-muted-foreground">Topic:</dt>
													<dd className="wrap-break-word whitespace-pre-wrap">
														{channel.topic}
													</dd>
												</div>
											)}
											{channel.rateLimitPerUser === null && (
												<div className="flex flex-wrap gap-x-1">
													<dt className="text-muted-foreground">Slowmode:</dt>
													<dd>Unavailable</dd>
												</div>
											)}
											{channel.bitrate !== undefined && (
												<div className="flex flex-wrap gap-x-1">
													<dt className="text-muted-foreground">Bitrate:</dt>
													<dd>{channel.bitrate.toLocaleString()} bps</dd>
												</div>
											)}
										</dl>
									</Card>
								</li>
							))}
						</ul>
					)}
				</Card>
			))}
		</div>
	);
}

function GuildChannels({ guild }: { guild: AdminGuildDetails }) {
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guild.id),
		enabled: false,
		retry: false,
	});
	const totalChannelCount = channelsQuery.data?.filter((channel) => channel.type !== 4).length;
	const accessStatus = accessErrorStatus(channelsQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const errorStatus = axios.isAxiosError(channelsQuery.error) ? channelsQuery.error.response?.status : undefined;
	const errorMessage =
		errorStatus === 409
			? "The bot is no longer a member of this guild."
			: errorStatus === 404
				? "This guild is no longer registered."
				: errorStatus === 503
					? "The guild or a required service is unavailable. Please try again."
					: "Could not load channels. Please try again.";

	return (
		<Card id="guild-channels" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Channels <GuildSectionLink id="guild-channels" label="channels" />
				</h2>
				{totalChannelCount !== undefined && (
					<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
						Total: {totalChannelCount} {totalChannelCount === 1 ? "channel" : "channels"}
					</span>
				)}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Load the current channels and categories from Discord. Threads are not included.
			</p>
			<Button
				type="button"
				size="sm"
				variant="outline-primary"
				className="mt-3"
				disabled={channelsQuery.isFetching || !guild.isActiveMember}
				onClick={() => void channelsQuery.refetch()}
			>
				{channelsQuery.data ? "Refresh channels" : "Load channels"}
			</Button>
			{!guild.isActiveMember && (
				<p className="mt-3 text-muted-foreground">The bot is not a member of this guild.</p>
			)}
			{channelsQuery.isFetching ? (
				<LoadingIndicator label="Loading channels" />
			) : channelsQuery.isError ? (
				<p role="alert" className="mt-3 text-destructive">
					{errorMessage}
				</p>
			) : channelsQuery.data?.length === 0 ? (
				<p className="mt-3 text-muted-foreground">No channels found.</p>
			) : channelsQuery.data ? (
				<ChannelGroupList guildId={guild.id} channels={channelsQuery.data} />
			) : null}
		</Card>
	);
}

function getActionErrorMessage(error: unknown, fallback: string): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return fallback;
}

function isBotChannelPermissionError(error: unknown): boolean {
	if (!axios.isAxiosError<{ error?: string; code?: string }>(error) || error.response?.status !== 403) {
		return false;
	}
	return (
		error.response.data?.code === "BOT_CHANNEL_PERMISSION_DENIED" ||
		error.response.data?.error === "Bot cannot send an embedded message to this channel"
	);
}

function GuildActions({ guild }: { guild: AdminGuildDetails }) {
	const queryClient = useQueryClient();
	const [channelId, setChannelId] = useState("");
	const [message, setMessage] = useState("");
	const [kickMessage, setKickMessage] = useState("");
	const [kickChannelId, setKickChannelId] = useState("");
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guild.id),
		enabled: false,
		retry: false,
	});
	const sendMessageMutation = useMutation<AdminGuildMessageResult, Error, { channelId: string; message: string }>({
		mutationFn: ({ channelId: selectedChannelId, message: content }) => {
			const promise = APIHandler.sendAdminGuildMessage(guild.id, content, selectedChannelId);
			toast.promise(promise, {
				loading: "Sending admin message...",
				success: "Admin message sent.",
				error: (error) => getActionErrorMessage(error, "Could not send the admin message."),
			});
			return promise;
		},
	});
	const inviteMutation = useMutation<AdminGuildInvite, Error>({
		mutationFn: () => {
			const promise = APIHandler.createAdminGuildInvite(guild.id);
			toast.promise(promise, {
				loading: "Getting guild invite...",
				success: "Guild invite ready.",
				error: (error) => getActionErrorMessage(error, "Could not get a guild invite."),
			});
			return promise;
		},
	});
	const commandDeploymentMutation = useMutation<AdminGuildCommandDeploymentResult, Error, "deploy" | "undeploy">({
		mutationFn: (action) => {
			const promise = APIHandler.updateAdminGuildCommands(guild.id, action);
			toast.promise(promise, {
				loading: action === "deploy" ? "Deploying guild commands..." : "Removing guild commands...",
				success: ({ action, commandCount }) =>
					action === "deploy"
						? `Deployed ${commandCount} guild command${commandCount === 1 ? "" : "s"}.`
						: "Removed all guild commands.",
				error: (error) => getActionErrorMessage(error, "Could not update guild commands."),
			});
			return promise;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["admin", "guild", guild.id] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "list-guilds"] });
		},
	});
	const kickMutation = useMutation({
		mutationFn: (selectedChannel: string | null) => {
			const promise = APIHandler.kickAdminGuild(guild.id, kickMessage, selectedChannel);
			toast.promise(promise, {
				loading: "Removing bot from guild...",
				success: (result) =>
					result.departureMessage
						? "The bot left the guild and sent a departure message."
						: "The bot left the guild without sending a departure message.",
				error: (error) =>
					axios.isAxiosError(error) && !error.response
						? "Could not confirm whether the bot left. Refresh guild details before retrying."
						: getActionErrorMessage(error, "Could not remove the bot from the guild."),
			});
			return promise;
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["user", "guild", guild.id, "channels"], exact: true });
			queryClient.removeQueries({ queryKey: ["user", "guild", guild.id, "roles"], exact: true });
			void queryClient.invalidateQueries({ queryKey: ["user", "guild", guild.id], exact: true });
			void queryClient.invalidateQueries({ queryKey: ["admin", "guild", guild.id] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "list-guilds"] });
		},
	});
	useEffect(() => {
		const isAvailable = (id: string) =>
			channelsQuery.data?.some(
				(channel) =>
					channel.id === id &&
					channel.canSendMessage &&
					["GuildText", "GuildAnnouncement"].includes(channel.typeName),
			);
		if (channelId && channelsQuery.data && !isAvailable(channelId)) {
			setChannelId("");
		}
		if (kickChannelId && channelsQuery.data && !isAvailable(kickChannelId)) {
			setKickChannelId("");
		}
	}, [channelId, kickChannelId, channelsQuery.data]);
	const accessStatus =
		accessErrorStatus(channelsQuery.error) ??
		(isBotChannelPermissionError(sendMessageMutation.error)
			? undefined
			: accessErrorStatus(sendMessageMutation.error)) ??
		accessErrorStatus(inviteMutation.error) ??
		accessErrorStatus(commandDeploymentMutation.error) ??
		accessErrorStatus(kickMutation.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const textChannels =
		channelsQuery.data?.filter(
			(channel) => channel.canSendMessage && ["GuildText", "GuildAnnouncement"].includes(channel.typeName),
		) ?? [];
	const selectedChannelId = textChannels.some((channel) => channel.id === channelId) ? channelId : "";
	const selectedKickChannelId = textChannels.some((channel) => channel.id === kickChannelId) ? kickChannelId : "";
	const inviteError = inviteMutation.isError
		? getActionErrorMessage(inviteMutation.error, "Could not get a guild invite.")
		: null;
	const channelsError = channelsQuery.isError
		? getActionErrorMessage(channelsQuery.error, "Could not load channels. Please try again.")
		: null;

	function submitMessage(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedChannelId) {
			toast.error("Select an available channel before sending.");
			return;
		}
		sendMessageMutation.mutate({ channelId: selectedChannelId, message });
	}

	async function copyInvite(inviteUrl: string) {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			toast.success("Invite copied.");
		} catch {
			toast.error("Could not copy the invite.");
		}
	}

	return (
		<Card id="admin-actions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Admin actions <GuildSectionLink id="admin-actions" label="admin actions" />
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Manage guild commands, send an admin message, get an invite, or remove the bot from this guild.
			</p>
			{!guild.isActiveMember ? (
				<p className="mt-4 text-muted-foreground">The bot is not a member of this guild.</p>
			) : (
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<section
						aria-labelledby="guild-commands-title"
						className="min-w-0 rounded-md border border-border p-4"
					>
						<h3 id="guild-commands-title" className="font-semibold">
							Guild commands
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Deploy the bot’s current guild commands or remove all commands from this guild.
						</p>
						<div className="mt-3 flex flex-wrap gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								disabled={commandDeploymentMutation.isPending}
								onClick={() => commandDeploymentMutation.mutate("deploy")}
							>
								{commandDeploymentMutation.isPending && commandDeploymentMutation.variables === "deploy"
									? "Deploying…"
									: "Deploy commands"}
							</Button>
							<DoubleClickButton
								doubleClickMsDuration={CONFIRM_CLICK_MS}
								type="button"
								size="sm"
								variant="outline-destructive"
								feedbackContent="Click again to undeploy"
								disabled={
									commandDeploymentMutation.isPending ||
									!guild.guildCommandDeploymentState ||
									guild.guildCommandDeploymentState.deployed === 0
								}
								onDoubleClick={() => commandDeploymentMutation.mutate("undeploy")}
							>
								{commandDeploymentMutation.isPending &&
								commandDeploymentMutation.variables === "undeploy"
									? "Removing…"
									: "Undeploy commands"}
							</DoubleClickButton>
						</div>
						{commandDeploymentMutation.isError && !accessErrorStatus(commandDeploymentMutation.error) && (
							<p role="alert" className="mt-3 text-sm text-destructive">
								{getActionErrorMessage(
									commandDeploymentMutation.error,
									"Could not update guild commands.",
								)}
							</p>
						)}
					</section>
					<section
						aria-labelledby="admin-message-title"
						className="min-w-0 rounded-md border border-border p-4 lg:order-3"
					>
						<h3 id="admin-message-title" className="font-semibold">
							Send admin message
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							The message is sent as an embed to one text channel.
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline-primary"
							className="mt-3"
							disabled={channelsQuery.isFetching}
							onClick={() => void channelsQuery.refetch()}
						>
							{channelsQuery.data ? "Refresh channels" : "Load channels"}
						</Button>
						{channelsError && (
							<p role="alert" className="mt-3 text-sm text-destructive">
								{channelsError}
							</p>
						)}
						{channelsQuery.data && (
							<form onSubmit={submitMessage} className="mt-4 space-y-3">
								<div>
									<LabelField id="admin-message-channel" label="Channel" className="mb-1" />
									<Select
										id="admin-message-channel"
										value={selectedChannelId}
										onChange={setChannelId}
										disabled={textChannels.length === 0 || sendMessageMutation.isPending}
										className="h-10"
										data={[
											{ key: "", label: "Select a channel", disabled: true },
											...textChannels.map((channel) => ({
												key: channel.id,
												label: `#${channel.name} (${channel.id}) | ${channel.parent?.name ?? "No Category"}`,
											})),
										]}
									/>
								</div>
								<div>
									<LabelField id="admin-message-content" label="Message" className="mb-1" />
									<Input
										as="textarea"
										id="admin-message-content"
										value={message}
										onChange={(event) => setMessage(event.target.value)}
										required
										maxLength={4096}
										rows={5}
										disabled={sendMessageMutation.isPending}
										placeholder="Write the message to send"
										className="min-h-24 w-full"
									/>
									<p className="mt-1 text-right text-xs text-muted-foreground">
										{message.length}/4096
									</p>
								</div>
								<Button
									type="submit"
									size="sm"
									disabled={
										!selectedChannelId ||
										message.trim().length === 0 ||
										textChannels.length === 0 ||
										sendMessageMutation.isPending
									}
								>
									{sendMessageMutation.isPending ? "Sending…" : "Send message"}
								</Button>
								{sendMessageMutation.data && (
									<p className="text-sm text-success">
										Message sent to {sendMessageMutation.data.channelName}.{" "}
										<ExternalTextLink
											href={sendMessageMutation.data.messageUrl}
											text="View message"
										/>
									</p>
								)}
								{channelsQuery.data && textChannels.length === 0 && (
									<p className="text-sm text-muted-foreground">
										No text channels are available for the bot to send an embedded message.
									</p>
								)}
							</form>
						)}
					</section>
					<section
						aria-labelledby="guild-invite-title"
						className="min-w-0 rounded-md border border-border p-4 lg:order-2"
					>
						<h3 id="guild-invite-title" className="font-semibold">
							Guild invite
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Use an existing invite when available, or create one for this guild.
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline-primary"
							className="mt-3"
							disabled={inviteMutation.isPending}
							onClick={() => inviteMutation.mutate()}
						>
							{inviteMutation.isPending ? "Getting invite…" : "Get invite"}
						</Button>
						{inviteError && (
							<p role="alert" className="mt-3 text-sm text-destructive">
								{inviteError}
							</p>
						)}
						{inviteMutation.data && (
							<div className="mt-4 space-y-2 wrap-break-word text-sm">
								<div className="flex flex-wrap items-center gap-2">
									<a
										href={inviteMutation.data.url}
										target="_blank"
										rel="noreferrer"
										className="text-primary underline underline-offset-2"
									>
										{inviteMutation.data.url}
									</a>
									<Button
										type="button"
										size="icon-xs"
										variant="ghost"
										className="shrink-0"
										aria-label="Copy invite"
										title="Copy invite"
										onClick={() => void copyInvite(inviteMutation.data.url)}
									>
										<FiCopy className="size-4" aria-hidden="true" />
									</Button>
								</div>
								<dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
									<div>
										<dt className="text-muted-foreground">Channel</dt>
										<dd>
											{inviteMutation.data.channel?.name ?? "Unknown"}
											{inviteMutation.data.channel && (
												<span className="ml-1 break-all text-xs text-muted-foreground">
													({inviteMutation.data.channel.id})
												</span>
											)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Created at</dt>
										<dd>
											{inviteMutation.data.createdTimestampMs === null
												? "Unknown"
												: DateHandler.getDateTime(inviteMutation.data.createdTimestampMs)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Expires at</dt>
										<dd>
											{inviteMutation.data.expiresTimestampMs === null
												? "Never"
												: DateHandler.getDateTime(inviteMutation.data.expiresTimestampMs)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Uses</dt>
										<dd>
											{inviteMutation.data.uses ?? 0} /{" "}
											{inviteMutation.data.maxUses === 0
												? "Unlimited"
												: (inviteMutation.data.maxUses ?? "Unknown")}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Temporary</dt>
										<dd>{inviteMutation.data.temporary ? "Yes" : "No"}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Inviter</dt>
										<dd>{inviteMutation.data.inviter?.username ?? "Unknown"}</dd>
									</div>
								</dl>
							</div>
						)}
					</section>
					<section
						aria-labelledby="guild-kick-title"
						className="min-w-0 rounded-md border border-border p-4 lg:order-4"
					>
						<h3 id="guild-kick-title" className="font-semibold">
							Remove bot from guild
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Optionally choose a channel for a departure message. The bot will still leave if sending
							fails.
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline-primary"
							className="mt-3"
							disabled={channelsQuery.isFetching || kickMutation.isPending}
							onClick={() => void channelsQuery.refetch()}
						>
							{channelsQuery.data ? "Refresh channels" : "Load channels"}
						</Button>
						{channelsError && (
							<p role="alert" className="mt-3 text-sm text-destructive">
								{channelsError}
							</p>
						)}
						<form
							className="mt-4 space-y-3"
							onSubmit={(event) => {
								// Removing the bot is confirmed by the button's second click, never by submitting the form
								event.preventDefault();
							}}
						>
							{channelsQuery.data && !channelsQuery.isError && (
								<div>
									<LabelField id="guild-kick-channel" label="Departure channel" className="mb-1" />
									<Select
										id="guild-kick-channel"
										value={selectedKickChannelId}
										onChange={setKickChannelId}
										disabled={
											textChannels.length === 0 ||
											channelsQuery.isFetching ||
											kickMutation.isPending
										}
										className="h-10"
										data={[
											{ key: "", label: "No departure message" },
											...textChannels.map((channel) => ({
												key: channel.id,
												label: `#${channel.name} (${channel.id}) | ${channel.parent?.name ?? "No Category"}`,
											})),
										]}
									/>
									{textChannels.length === 0 && (
										<p className="mt-1 text-sm text-muted-foreground">
											No sendable channels are available. The bot will leave without sending a
											departure message.
										</p>
									)}
								</div>
							)}
							<div>
								<LabelField
									id="guild-kick-message"
									label="Additional departure message (optional)"
									className="mb-1"
								/>
								<Input
									as="textarea"
									id="guild-kick-message"
									value={kickMessage}
									onChange={(event) => setKickMessage(event.target.value)}
									maxLength={1000}
									rows={3}
									placeholder="Write the message to send"
									disabled={kickMutation.isPending || !selectedKickChannelId}
									className="min-h-20 w-full"
								/>
							</div>
							<DoubleClickButton
								doubleClickMsDuration={CONFIRM_CLICK_MS}
								type="button"
								size="sm"
								variant="outline-destructive"
								feedbackContent="Click again to remove"
								title={`Remove the bot from ${guild.name} (click twice)`}
								disabled={kickMutation.isPending}
								onDoubleClick={() => kickMutation.mutate(selectedKickChannelId || null)}
							>
								{kickMutation.isPending ? "Removing bot…" : "Remove bot from guild"}
							</DoubleClickButton>
						</form>
					</section>
				</div>
			)}
		</Card>
	);
}

function GuildDetails({ guild }: { guild: AdminGuildDetails }) {
	const [section, setSection] = useState(readSectionFromHash);

	useEffect(() => {
		const handleHashChange = () => setSection(readSectionFromHash());
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const changeSection = (value: string) => {
		setSection(value);
		window.history.replaceState(
			window.history.state,
			"",
			`${window.location.pathname}${window.location.search}#${value}`,
		);
	};

	return (
		<Tabs value={section} onValueChange={changeSection} className="gap-5">
			<TabsList aria-label="Guild sections">
				{guildSections.map(({ id, label }) => (
					<TabsTab key={id} value={id} size="sm">
						{label}
					</TabsTab>
				))}
			</TabsList>
			<TabsPanel value="guild-overview" keepMounted>
				<GuildOverview guild={guild} />
			</TabsPanel>
			<TabsPanel value="admin-actions" keepMounted>
				<GuildActions key={guild.id} guild={guild} />
			</TabsPanel>
			<TabsPanel value="guild-channels" keepMounted>
				<GuildChannels guild={guild} />
			</TabsPanel>
			<TabsPanel value="service-preferences" keepMounted>
				<ServicePreferencesEditor guild={guild} active={section === "service-preferences"} />
			</TabsPanel>
			<TabsPanel value="bot-permissions" keepMounted>
				<BotPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
			<TabsPanel value="command-permissions" keepMounted>
				<CommandPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
		</Tabs>
	);
}

export default function AdminViewGuild() {
	const { guildId = "" } = useParams();
	const navigate = useNavigate();
	const validGuildId = guildIdPattern.test(guildId);
	const guildQuery = useQuery({
		queryKey: ["admin", "guild", guildId],
		queryFn: () => APIHandler.getAdminGuild(guildId),
		enabled: validGuildId,
	});
	// The ID joins the title once the guild has loaded
	useDocumentTitle(formatTitle(guildQuery.isSuccess ? `View Guild: ${guildId}` : "View Guild", "Admin"));

	const guildNotFound =
		guildQuery.isError && axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 404;

	useEffect(() => {
		if (!validGuildId || guildQuery.isFetching || !guildNotFound) return;
		toast.warning(`Guild ${guildId} not found.`, { id: "guild-not-found" });
		navigate("/admin/guild", { replace: true });
	}, [guildId, guildNotFound, guildQuery.isFetching, navigate, validGuildId]);

	async function refreshGuild() {
		const result = await guildQuery.refetch();
		if (result.isError) {
			if (
				!accessErrorStatus(result.error) &&
				(!axios.isAxiosError(result.error) || result.error.response?.status !== 404)
			) {
				toast.error("Could not refresh guild details. Please try again.");
			}
		} else {
			toast.success("Guild details refreshed.");
		}
	}

	const accessStatus = accessErrorStatus(guildQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	let content: ReactNode;
	if (!guildId) {
		content = <p className="text-muted-foreground">Enter a guild ID to view its details.</p>;
	} else if (!validGuildId) {
		content = <p role="alert">Invalid guild ID.</p>;
	} else if (guildQuery.isPending || guildQuery.isFetching) {
		content = <LoadingIndicator label="Loading guild" />;
	} else if (guildQuery.isError) {
		content = guildNotFound ? null : (
			<div role="alert">
				<p>Could not load guild details. Check your access and try again.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void guildQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else {
		content = <GuildDetails guild={guildQuery.data} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/admin/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				All guilds
			</PillLink>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">Guild : {guildId}</h1>
			{validGuildId && guildQuery.isSuccess ? (
				<Button
					type="button"
					size="sm"
					variant="outline-destructive"
					className="mb-6"
					onClick={() => navigate("/admin/guild")}
				>
					Reset
				</Button>
			) : (
				<GuildLookup
					key={guildId}
					guildId={guildId}
					onLookup={(id) => {
						if (id === guildId) {
							void refreshGuild();
						} else {
							navigate(`/admin/guild/${encodeURIComponent(id)}`);
						}
					}}
				/>
			)}
			{content}
		</main>
	);
}
