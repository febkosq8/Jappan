import {
	Avatar,
	Button,
	Card,
	DateHandler,
	Input,
	LabelField,
	PillLink,
	Select,
	Tabs,
	TabsList,
	TabsPanel,
	TabsTab,
} from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { FiArrowLeft, FiCopy, FiLink } from "react-icons/fi";
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
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import GuildCommandDeployment from "@jappan/components/GuildCommandDeployment";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildPreferencesEditor from "./GuildPreferencesEditor";

const guildIdPattern = /^\d{17,20}$/u;
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

function SectionLink({ id, label }: { id: string; label: string }) {
	return (
		<a
			href={`#${id}`}
			aria-label={`Link to ${label}`}
			title={`Link to ${label}`}
			className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<FiLink className="size-4" aria-hidden="true" />
		</a>
	);
}

function GuildLookup({ guildId, onLookup }: { guildId: string; onLookup: (guildId: string) => void }) {
	const form = useForm({
		defaultValues: { guildId },
		onSubmit: ({ value }) => onLookup(value.guildId.trim()),
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
			className="mb-6 max-w-xl"
		>
			<form.Field
				name="guildId"
				validators={{
					onSubmit: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
					onChange: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
				}}
			>
				{(field) => {
					const error = field.state.meta.errors[0];
					return (
						<>
							<LabelField id="guild-id" label="Guild ID" className="mb-2" />
							<div className="flex flex-col gap-2 sm:flex-row">
								<Input
									id="guild-id"
									name={field.name}
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
									onBlur={field.handleBlur}
									inputMode="numeric"
									placeholder="Enter a Discord guild ID"
									aria-invalid={!!error}
									aria-describedby={error ? "guild-id-error" : undefined}
									className="h-10 min-w-0 flex-1"
								/>
								<Button type="submit">View guild</Button>
							</div>
							{error && (
								<p id="guild-id-error" role="alert" className="mt-2 text-sm text-destructive">
									{error}
								</p>
							)}
						</>
					);
				}}
			</form.Field>
		</form>
	);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="mt-1 wrap-break-word font-medium">{children}</dd>
		</Card>
	);
}

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
						createdAt: null,
						channels: uncategorized,
					},
				]
			: []),
		...categories.map((category) => ({
			key: category.id,
			name: category.name,
			categoryId: category.id,
			unavailable: false,
			createdAt: category.createdAt,
			channels: childrenByParent.get(category.id) ?? [],
		})),
		...missingCategories.map(([id, children]) => ({
			key: id,
			name: children[0]?.parent?.name ?? "Unavailable category",
			categoryId: id,
			unavailable: true,
			createdAt: null,
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
					<h3 className="wrap-break-word font-semibold">{group.name}</h3>
					{group.categoryId && (
						<p className="break-all text-xs text-muted-foreground">
							{group.unavailable ? "Category unavailable · " : ""}
							{group.categoryId}
						</p>
					)}
					{group.createdAt !== null && (
						<p className="mt-1 text-sm text-muted-foreground">
							Created: {DateHandler.getDateTime(group.createdAt)} (
							{DateHandler.getRelativeTime(group.createdAt)})
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
												<ExternalTextLink
													href={`https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(channel.id)}`}
													text={channel.name}
												/>
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
													{DateHandler.getDateTime(channel.createdAt)}{" "}
													<span className="text-muted-foreground">
														({DateHandler.getRelativeTime(channel.createdAt)})
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
		queryKey: ["admin", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getAdminGuildChannels(guild.id),
		enabled: false,
		retry: false,
	});
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
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Channels <SectionLink id="guild-channels" label="channels" />
			</h2>
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
	const [kickConfirmed, setKickConfirmed] = useState(false);
	const [kickChannelId, setKickChannelId] = useState("");
	const channelsQuery = useQuery({
		queryKey: ["admin", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getAdminGuildChannels(guild.id),
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
			queryClient.removeQueries({ queryKey: ["admin", "guild", guild.id, "channels"] });
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
				Admin actions <SectionLink id="admin-actions" label="admin actions" />
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
							<Button
								type="button"
								size="sm"
								variant="outline-destructive"
								disabled={
									commandDeploymentMutation.isPending ||
									!guild.guildCommandDeploymentState ||
									guild.guildCommandDeploymentState.deployed === 0
								}
								onClick={() => commandDeploymentMutation.mutate("undeploy")}
							>
								{commandDeploymentMutation.isPending &&
								commandDeploymentMutation.variables === "undeploy"
									? "Removing…"
									: "Undeploy commands"}
							</Button>
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
											{inviteMutation.data.createdTimestamp === null
												? "Unknown"
												: DateHandler.getDateTime(inviteMutation.data.createdTimestamp)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Expires at</dt>
										<dd>
											{inviteMutation.data.expiresTimestamp === null
												? "Never"
												: DateHandler.getDateTime(inviteMutation.data.expiresTimestamp)}
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
								event.preventDefault();
								if (!kickConfirmed) {
									toast.error("Confirm removal before continuing.");
									return;
								}
								kickMutation.mutate(selectedKickChannelId || null);
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
							<label className="flex items-start gap-2 text-sm">
								<input
									type="checkbox"
									checked={kickConfirmed}
									onChange={(event) => setKickConfirmed(event.target.checked)}
									disabled={kickMutation.isPending}
									className="mt-1"
								/>
								<span>I confirm the bot should leave {guild.name}.</span>
							</label>
							<Button
								type="submit"
								size="sm"
								variant="outline-destructive"
								disabled={!kickConfirmed || kickMutation.isPending}
							>
								{kickMutation.isPending ? "Removing bot…" : "Remove bot from guild"}
							</Button>
						</form>
					</section>
				</div>
			)}
		</Card>
	);
}

function GuildDetails({ guild }: { guild: AdminGuildDetails }) {
	const commandsQuery = useQuery({
		queryKey: ["public", "commands"],
		queryFn: APIHandler.getGlobalCommands,
		enabled: guild.permissions !== undefined,
	});
	const grantedPermissions = new Set(guild.permissions);
	const isAdministrator = grantedPermissions.has("Administrator");
	const commands = commandsQuery.data?.filter(
		(command, _index, all) => !all.some((other) => other.name.startsWith(`${command.name} `)),
	);

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
				<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Guild overview <SectionLink id="guild-overview" label="guild overview" />
					</h2>
					<div className="mt-4 flex items-center gap-4">
						<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
						<div className="min-w-0">
							<h3 className="wrap-break-word text-xl font-bold">
								<ExternalTextLink
									href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
									text={guild.name}
								/>
							</h3>
							<p className="break-all text-sm text-muted-foreground">{guild.id}</p>
						</div>
					</div>
					<dl className="mt-5 grid gap-3 sm:grid-cols-2">
						<Detail label="Bot membership">{guild.isActiveMember ? "Active" : "Inactive"}</Detail>
						<Detail label="Guild commands">
							<GuildCommandDeployment deployment={guild.guildCommandDeploymentState} />
						</Detail>
						<Detail label="Members">
							{guild.memberCount === undefined ? "Unavailable" : guild.memberCount.toLocaleString()}
						</Detail>
						<Detail label="Channels">
							{guild.channelCount === undefined ? "Unavailable" : guild.channelCount.toLocaleString()}
						</Detail>
						<Detail label="Owner">
							{guild.owner ? (
								<div className="flex items-center gap-2">
									<Avatar
										name={guild.owner.username}
										image={guild.owner.avatarUrl}
										size="sm"
										aria-hidden="true"
									/>
									<div className="min-w-0">
										<ExternalTextLink
											href={`https://discord.com/users/${encodeURIComponent(guild.owner.userId)}`}
											text={guild.owner.username}
										/>
										<p className="break-all text-xs text-muted-foreground">{guild.owner.userId}</p>
									</div>
								</div>
							) : (
								"Unavailable"
							)}
						</Detail>
						<Detail label="Created">
							{guild.createdAt === undefined ? (
								"Unavailable"
							) : (
								<>
									<span className="block">{DateHandler.getDateTime(guild.createdAt)}</span>
									<span className="text-sm text-muted-foreground">
										{DateHandler.getRelativeTime(guild.createdAt)}
									</span>
								</>
							)}
						</Detail>
						<Detail label="Joined">
							{guild.joinedTimestamp === undefined ? (
								"Unavailable"
							) : (
								<>
									<span className="block">{DateHandler.getDateTime(guild.joinedTimestamp)}</span>
									<span className="text-sm text-muted-foreground">
										{DateHandler.getRelativeTime(guild.joinedTimestamp)}
									</span>
								</>
							)}
						</Detail>
						<Detail label="Discovered">
							{guild.discoveredAt == null ? (
								"Unavailable"
							) : (
								<>
									<span className="block">{DateHandler.getDateTime(guild.discoveredAt)}</span>
									<span className="text-sm text-muted-foreground">
										{DateHandler.getRelativeTime(guild.discoveredAt)}
									</span>
								</>
							)}
						</Detail>
						<Detail label="System channel">
							{guild.systemChannel === undefined ? (
								"Unavailable"
							) : guild.systemChannel === null ? (
								"None"
							) : (
								<>
									<ExternalTextLink
										href={`https://discord.com/channels/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.systemChannel.id)}`}
										text={guild.systemChannel.name}
									/>
									<span className="block break-all text-xs text-muted-foreground">
										{guild.systemChannel.id}
									</span>
								</>
							)}
						</Detail>
						<Detail label="Required permissions">
							{guild.hasRequiredPermissions === undefined ? (
								"Unavailable"
							) : guild.hasRequiredPermissions ? (
								<span className="text-success">All granted</span>
							) : (
								<span className="text-destructive">Some missing</span>
							)}
						</Detail>
						<Detail label="Description">
							{guild.description === undefined ? "Unavailable" : (guild.description ?? "None")}
						</Detail>
					</dl>
				</Card>
			</TabsPanel>
			<TabsPanel value="admin-actions" keepMounted>
				<GuildActions key={guild.id} guild={guild} />
			</TabsPanel>
			<TabsPanel value="guild-channels" keepMounted>
				<GuildChannels guild={guild} />
			</TabsPanel>
			<TabsPanel value="service-preferences" keepMounted>
				<GuildPreferencesEditor guild={guild} />
			</TabsPanel>
			<TabsPanel value="bot-permissions" keepMounted>
				<Card id="bot-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Bot permissions <SectionLink id="bot-permissions" label="bot permissions" />
					</h2>
					{guild.permissions === undefined ? (
						<p className="mt-3 text-muted-foreground">Unavailable</p>
					) : guild.permissions.length === 0 ? (
						<p className="mt-3 text-muted-foreground">None</p>
					) : (
						<ul className="mt-3 flex flex-wrap gap-2">
							{guild.permissions.map((permission) => (
								<li
									key={permission}
									className="rounded-md border border-border bg-muted px-3 py-1 text-sm"
								>
									{permission}
								</li>
							))}
						</ul>
					)}
				</Card>
			</TabsPanel>
			<TabsPanel value="command-permissions" keepMounted>
				<Card id="command-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Command permissions <SectionLink id="command-permissions" label="command permissions" />
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Declared bot permissions at guild level. Channel overrides and other requirements can affect
						whether a command works.
					</p>
					{guild.permissions === undefined ? (
						<p className="mt-3 text-muted-foreground">Unavailable</p>
					) : commandsQuery.isPending ? (
						<LoadingIndicator label="Loading commands" />
					) : commandsQuery.isError ? (
						<div role="alert" className="mt-3">
							<p>Could not load command permissions. Please try again.</p>
							<Button size="sm" variant="outline-primary" onClick={() => void commandsQuery.refetch()}>
								Retry
							</Button>
						</div>
					) : !commands?.length ? (
						<p className="mt-3 text-muted-foreground">No commands available</p>
					) : (
						<ul className="mt-3 grid gap-3 sm:grid-cols-2">
							{commands.map(({ name, requiredBotPermissions }) => {
								const permissions = requiredBotPermissions.map(
									(permission) =>
										[permission, isAdministrator || grantedPermissions.has(permission)] as const,
								);
								const missing = permissions.some(([, granted]) => !granted);
								return (
									<li key={name} className="min-w-0 rounded-md border border-border p-3">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<h3 className="wrap-break-word font-medium">/{name}</h3>
											<span className={missing ? "text-destructive" : "text-success"}>
												{missing
													? "Some required permissions missing"
													: "All required permissions granted"}
											</span>
										</div>
										{permissions.length === 0 ? (
											<p className="mt-2 text-sm text-muted-foreground">
												No declared permissions
											</p>
										) : (
											<ul className="mt-2 space-y-1 text-sm">
												{permissions.map(([permission, granted]) => (
													<li key={permission} className="flex justify-between gap-3">
														<span className="min-w-0 wrap-break-word">{permission}</span>
														<span className={granted ? "text-success" : "text-destructive"}>
															{granted ? "Granted" : "Missing"}
														</span>
													</li>
												))}
											</ul>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</Card>
			</TabsPanel>
		</Tabs>
	);
}

export default function ViewGuild() {
	const { guildId = "" } = useParams();
	document.title = `Admin - View Guild (${guildId})`;
	const navigate = useNavigate();
	const validGuildId = guildIdPattern.test(guildId);
	const guildQuery = useQuery({
		queryKey: ["admin", "guild", guildId],
		queryFn: () => APIHandler.getAdminGuild(guildId),
		enabled: validGuildId,
	});

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
