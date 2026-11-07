import { Avatar, Button, Card, DateHandler, Input, PillLink, TextLink } from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { FiArrowLeft, FiExternalLink, FiLink } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, {
	type AdminGuildInvite,
	type AdminGuildChannel,
	type AdminGuildDetails,
	type AdminGuildMessageResult,
	type PreferenceEntity,
} from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/jappan/AdminRoute";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";

const guildIdPattern = /^\d{17,20}$/u;
const guildSectionIds = [
	"guild-overview",
	"guild-actions",
	"guild-channels",
	"service-preferences",
	"bot-permissions",
	"command-permissions",
];

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
							<label htmlFor="guild-id" className="mb-2 block text-sm font-medium">
								Guild ID
							</label>
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

function DiscordTextLink({ href, text }: { href: string; text: string }) {
	return (
		<span>
			<TextLink href={href} text={text} aria-label={`${text} (opens in a new tab)`} />
			<FiExternalLink className="ml-1 inline-block size-3.5 align-baseline text-primary" aria-hidden="true" />
		</span>
	);
}

function PreferenceChannelDetail({ guildId, channel }: { guildId: string; channel: PreferenceEntity | null }) {
	return channel ? (
		<>
			<DiscordTextLink
				href={`https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(channel.id)}`}
				text={channel.name ?? "Channel unavailable"}
			/>
			<span className="block break-all text-xs text-muted-foreground">{channel.id}</span>
		</>
	) : (
		"Not configured"
	);
}

function GuildPreferences({ guild }: { guild: AdminGuildDetails }) {
	const { auditLog, leveling, memberAnnouncements, warnings } = guild.preferences;
	return (
		<Card id="service-preferences" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Service preferences <SectionLink id="service-preferences" label="service preferences" />
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Saved settings; channel and role availability may change.
			</p>
			<div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-y-2">
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="audit-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-4 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="audit-preferences" className="font-semibold">
						Audit log
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-3 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Status">{auditLog.enabled ? "Enabled" : "Disabled"}</Detail>
						<Detail label="Channel">
							<PreferenceChannelDetail guildId={guild.id} channel={auditLog.channel} />
						</Detail>
						<Detail label="Full verbosity">{auditLog.fullVerbosity ? "Enabled" : "Disabled"}</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="leveling-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-4 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="leveling-preferences" className="font-semibold">
						Leveling
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-3 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Status">{leveling.enabled ? "Enabled" : "Disabled"}</Detail>
						<Detail label="Threshold">{leveling.threshold ?? "Not configured"}</Detail>
						<Detail label="Role">
							{leveling.role ? (
								<>
									<span>{leveling.role.name ?? "Role unavailable"}</span>
									<span className="block break-all text-xs text-muted-foreground">
										{leveling.role.id}
									</span>
								</>
							) : (
								"Not configured"
							)}
						</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="announcement-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-5 sm:mt-2 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="announcement-preferences" className="font-semibold">
						Member announcements
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-4 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Join announcements">
							{memberAnnouncements.joinEnabled ? "Enabled" : "Disabled"}
						</Detail>
						<Detail label="Join channel">
							<PreferenceChannelDetail guildId={guild.id} channel={memberAnnouncements.joinChannel} />
						</Detail>
						<Detail label="Leave announcements">
							{memberAnnouncements.leaveEnabled ? "Enabled" : "Disabled"}
						</Detail>
						<Detail label="Leave channel">
							<PreferenceChannelDetail guildId={guild.id} channel={memberAnnouncements.leaveChannel} />
						</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="warning-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-5 sm:mt-2 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="warning-preferences" className="font-semibold">
						Warnings
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-4 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Timeout threshold">{warnings.timeoutThreshold ?? "Not configured"}</Detail>
						<Detail label="Timeout duration (hours)">
							{warnings.timeoutDurationHours ?? "Not configured"}
						</Detail>
						<Detail label="Ban threshold">{warnings.banThreshold ?? "Not configured"}</Detail>
						<Detail label="Audit channel">
							<PreferenceChannelDetail guildId={guild.id} channel={warnings.auditChannel} />
						</Detail>
					</dl>
				</Card>
			</div>
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
												<DiscordTextLink
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

function GuildActions({ guild }: { guild: AdminGuildDetails }) {
	const [channelId, setChannelId] = useState("");
	const [message, setMessage] = useState("");
	const channelsQuery = useQuery({
		queryKey: ["admin", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getAdminGuildChannels(guild.id),
		enabled: false,
		retry: false,
	});
	const sendMessageMutation = useMutation<AdminGuildMessageResult, Error, { channelId: string; message: string }>({
		mutationFn: ({ channelId: selectedChannelId, message: content }) =>
			APIHandler.sendAdminGuildMessage(guild.id, content, selectedChannelId),
		onSuccess: () => toast.success("Admin message sent."),
	});
	const inviteMutation = useMutation<AdminGuildInvite, Error>({
		mutationFn: () => APIHandler.createAdminGuildInvite(guild.id),
		onSuccess: () => toast.success("Guild invite ready."),
	});
	const accessStatus =
		accessErrorStatus(channelsQuery.error) ??
		accessErrorStatus(sendMessageMutation.error) ??
		accessErrorStatus(inviteMutation.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const textChannels =
		channelsQuery.data?.filter((channel) => ["GuildText", "GuildAnnouncement"].includes(channel.typeName)) ?? [];
	const sendMessageError = sendMessageMutation.isError
		? getActionErrorMessage(sendMessageMutation.error, "Could not send the admin message.")
		: null;
	const inviteError = inviteMutation.isError
		? getActionErrorMessage(inviteMutation.error, "Could not get a guild invite.")
		: null;
	const channelsError = channelsQuery.isError
		? getActionErrorMessage(channelsQuery.error, "Could not load channels. Please try again.")
		: null;

	function submitMessage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		sendMessageMutation.mutate({ channelId, message });
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
		<Card id="guild-actions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Admin actions <SectionLink id="guild-actions" label="admin actions" />
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">Send an admin message or get an invite for this guild.</p>
			{!guild.isActiveMember ? (
				<p className="mt-4 text-muted-foreground">The bot is not a member of this guild.</p>
			) : (
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<section
						aria-labelledby="admin-message-title"
						className="min-w-0 rounded-md border border-border p-4"
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
									<label htmlFor="admin-message-channel" className="mb-1 block text-sm font-medium">
										Channel
									</label>
									<select
										id="admin-message-channel"
										value={channelId}
										onChange={(event) => setChannelId(event.target.value)}
										required
										disabled={textChannels.length === 0 || sendMessageMutation.isPending}
										className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75"
									>
										<option value="">Select a channel</option>
										{textChannels.map((channel) => (
											<option key={channel.id} value={channel.id}>
												#{channel.name} ({channel.id})
											</option>
										))}
									</select>
								</div>
								<div>
									<label htmlFor="admin-message-content" className="mb-1 block text-sm font-medium">
										Message
									</label>
									<textarea
										id="admin-message-content"
										value={message}
										onChange={(event) => setMessage(event.target.value)}
										required
										maxLength={4096}
										rows={5}
										disabled={sendMessageMutation.isPending}
										placeholder="Write the message to send"
										className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75"
									/>
									<p className="mt-1 text-right text-xs text-muted-foreground">
										{message.length}/4096
									</p>
								</div>
								<Button
									type="submit"
									size="sm"
									disabled={
										!channelId ||
										message.trim().length === 0 ||
										textChannels.length === 0 ||
										sendMessageMutation.isPending
									}
								>
									{sendMessageMutation.isPending ? "Sending…" : "Send message"}
								</Button>
								{sendMessageError && (
									<p role="alert" className="text-sm text-destructive">
										{sendMessageError}
									</p>
								)}
								{sendMessageMutation.data && (
									<p className="text-sm text-success">
										Message sent to {sendMessageMutation.data.channelName}.{" "}
										<DiscordTextLink
											href={sendMessageMutation.data.messageUrl}
											text="View message"
										/>
									</p>
								)}
								{channelsQuery.data && textChannels.length === 0 && (
									<p className="text-sm text-muted-foreground">No text channels are available.</p>
								)}
							</form>
						)}
					</section>
					<section
						aria-labelledby="guild-invite-title"
						className="min-w-0 rounded-md border border-border p-4"
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
							<div className="mt-4 space-y-2 break-words text-sm">
								<p>
									<a
										href={inviteMutation.data.url}
										target="_blank"
										rel="noreferrer"
										className="text-primary underline underline-offset-2"
									>
										{inviteMutation.data.url}
									</a>
								</p>
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
										<dt className="text-muted-foreground">Age</dt>
										<dd>
											{inviteMutation.data.maxAge === 0
												? "Never"
												: inviteMutation.data.maxAge === null
													? "Unknown"
													: `${Math.floor(inviteMutation.data.maxAge / 3600)} hours`}
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
								<Button
									type="button"
									size="sm"
									variant="outline-secondary"
									onClick={() => void copyInvite(inviteMutation.data.url)}
								>
									Copy invite
								</Button>
							</div>
						)}
					</section>
				</div>
			)}
		</Card>
	);
}

function GuildDetails({
	guild,
	scrollContainerRef,
}: {
	guild: AdminGuildDetails;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
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

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const sections = guildSectionIds
			.map((id) => document.getElementById(id))
			.filter((section): section is HTMLElement => section !== null);
		let linkedScrollTop: number | undefined;
		const scrollToHash = () => {
			const section = sections.find((item) => `#${item.id}` === window.location.hash);
			if (section) {
				section.scrollIntoView({ block: "start", behavior: "instant" });
				linkedScrollTop = container.scrollTop;
			}
		};
		const syncHash = () => {
			if (linkedScrollTop !== undefined && Math.abs(container.scrollTop - linkedScrollTop) < 1) return;
			linkedScrollTop = undefined;
			const bounds = container.getBoundingClientRect();
			const midpoint = bounds.top + bounds.height / 2;
			const lastSection = sections[sections.length - 1];
			const atBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 1;
			const active =
				atBottom && lastSection
					? lastSection
					: sections.reduce<HTMLElement | undefined>((closest, section) => {
							const distance = (item: HTMLElement) => {
								const rect = item.getBoundingClientRect();
								return Math.max(rect.top - midpoint, midpoint - rect.bottom, 0);
							};
							return !closest || distance(section) < distance(closest) ? section : closest;
						}, undefined);
			if (!active || window.location.hash === `#${active.id}`) return;
			window.history.replaceState(
				window.history.state,
				"",
				`${window.location.pathname}${window.location.search}#${active.id}`,
			);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		};
		const handleHashChange = (event: HashChangeEvent) => {
			if (event.isTrusted) scrollToHash();
		};
		if (guildSectionIds.includes(window.location.hash.slice(1))) scrollToHash();
		syncHash();
		container.addEventListener("scroll", syncHash, { passive: true });
		window.addEventListener("hashchange", handleHashChange);
		return () => {
			container.removeEventListener("scroll", syncHash);
			window.removeEventListener("hashchange", handleHashChange);
		};
	}, [guild.id, scrollContainerRef]);

	return (
		<div className="space-y-5">
			<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Guild overview <SectionLink id="guild-overview" label="guild overview" />
				</h2>
				<div className="mt-4 flex items-center gap-4">
					<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
					<div className="min-w-0">
						<h3 className="wrap-break-word text-xl font-bold">
							<DiscordTextLink
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
						{guild.guildCommandDeployment === null ? (
							"Unavailable"
						) : guild.guildCommandDeployment.total === 0 ? (
							"No guild commands configured"
						) : (
							<>
								{guild.guildCommandDeployment.deployed === 0
									? "Not deployed"
									: guild.guildCommandDeployment.deployed === guild.guildCommandDeployment.total
										? "Deployed"
										: "Partially deployed"}
								<span className="block text-sm text-muted-foreground">
									{guild.guildCommandDeployment.deployed} of {guild.guildCommandDeployment.total}{" "}
									registered
								</span>
							</>
						)}
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
									<DiscordTextLink
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
								<DiscordTextLink
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
			<GuildActions key={guild.id} guild={guild} />
			<GuildChannels guild={guild} />
			<GuildPreferences guild={guild} />
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
							<li key={permission} className="rounded-md border border-border bg-muted px-3 py-1 text-sm">
								{permission}
							</li>
						))}
					</ul>
				)}
			</Card>
			<Card id="command-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Command permissions <SectionLink id="command-permissions" label="command permissions" />
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Declared bot permissions at guild level. Channel overrides and other requirements can affect whether
					a command works.
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
										<p className="mt-2 text-sm text-muted-foreground">No declared permissions</p>
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
		</div>
	);
}

export default function ViewGuild({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLDivElement | null> }) {
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
		content = <GuildDetails guild={guildQuery.data} scrollContainerRef={scrollContainerRef} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/admin/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				All guilds
			</PillLink>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">Guild details</h1>
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
