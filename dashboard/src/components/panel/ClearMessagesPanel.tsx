import { Button, Card, Input, LabelField, Select, Tag } from "@febkosq8/arc";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type AdminGuildClearMessagePreview, type WarningMember } from "@jappan/handlers/APIHandler";

const clearableChannelTypes = new Set(["GuildText", "GuildAnnouncement", "GuildVoice"]);

function getErrorMessage(error: unknown, fallback: string): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return fallback;
}

export default function ClearMessagesPanel({
	active,
	initialGuildId = "",
}: {
	active: boolean;
	initialGuildId?: string;
}) {
	const navigate = useNavigate();
	const [guildId, setGuildId] = useState(initialGuildId);
	const [channelId, setChannelId] = useState("");
	const [countInput, setCountInput] = useState("100");
	const [text, setText] = useState("");
	const [selectedMember, setSelectedMember] = useState<WarningMember | null>(null);
	const [preview, setPreview] = useState<AdminGuildClearMessagePreview | null>(null);
	const [confirmationChecked, setConfirmationChecked] = useState(false);

	useEffect(() => {
		setGuildId(initialGuildId);
		setChannelId("");
		setSelectedMember(null);
		setPreview(null);
		setConfirmationChecked(false);
	}, [initialGuildId]);

	const guildsQuery = useQuery({
		queryKey: ["user", "guilds", "manager"],
		queryFn: APIHandler.getManagedGuilds,
		enabled: active && !initialGuildId,
		retry: false,
	});
	const channelsQuery = useQuery({
		queryKey: ["admin", "guild", guildId, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guildId),
		enabled: active && Boolean(guildId),
		retry: false,
	});
	const previewMutation = useMutation({
		mutationFn: () => {
			if (!guildId || !channelId) throw new Error("Select a server and channel first.");
			const count = Number(countInput);
			if (!Number.isInteger(count) || count < 1 || count > 100) {
				throw new Error("Enter a message limit between 1 and 100.");
			}
			return APIHandler.previewAdminGuildMessages(guildId, {
				channelId,
				count,
				...(selectedMember ? { userId: selectedMember.id } : {}),
				...(text.trim() ? { text: text.trim() } : {}),
			});
		},
		onSuccess: (result) => {
			setPreview(result);
			setConfirmationChecked(false);
		},
	});
	const clearMutation = useMutation({
		mutationFn: async () => {
			if (!guildId || !preview) throw new Error("Create a fresh preview before confirming.");
			return APIHandler.startAdminGuildMessageClear(guildId, preview.previewId);
		},
		onSuccess: (startedJob) => {
			setPreview(null);
			setConfirmationChecked(false);
			navigate(`/clear-jobs/${encodeURIComponent(startedJob.jobId)}`);
		},
	});

	const channels = (channelsQuery.data ?? []).filter((channel) => clearableChannelTypes.has(channel.typeName));
	const count = Number(countInput);
	const canPreview = Boolean(guildId && channelId) && Number.isInteger(count) && count >= 1 && count <= 100;
	const isBusy = previewMutation.isPending || clearMutation.isPending;
	const updateFilter = (update: () => void) => {
		update();
		setPreview(null);
		setConfirmationChecked(false);
		previewMutation.reset();
		clearMutation.reset();
	};

	return (
		<section aria-labelledby="clear-messages-heading" className="space-y-4">
			<div>
				<h2 id="clear-messages-heading" className="text-xl font-semibold">
					Clear messages
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Review a preview before deleting. Only the latest 100 messages in the selected channel are scanned.
				</p>
			</div>
			<Card hoverable={false} className="rounded-md border-border">
				<Card.Content className="space-y-4 p-4!">
					{!initialGuildId && guildsQuery.isPending ? (
						<LoadingIndicator label="Loading manageable servers" inline size={80} rows={1} columns={5} />
					) : !initialGuildId && guildsQuery.isError ? (
						<p role="alert" className="text-sm text-destructive">
							{getErrorMessage(guildsQuery.error, "Could not load servers you can manage.")}
						</p>
					) : !initialGuildId && guildsQuery.data?.length === 0 ? (
						<p className="text-sm text-muted-foreground">No manageable servers are available.</p>
					) : (
						<div className="grid gap-4 sm:grid-cols-2">
							{!initialGuildId && (
								<div>
									<LabelField id="clear-messages-guild" label="Server" className="mb-1" />
									<Select
										id="clear-messages-guild"
										value={guildId}
										onChange={(value) => {
											updateFilter(() => {
												setGuildId(value);
												setChannelId("");
												setSelectedMember(null);
											});
										}}
										data={[
											{ key: "", label: "Select a server" },
											...(guildsQuery.data ?? []).map((guild) => ({
												key: guild.id,
												label: guild.name,
											})),
										]}
										disabled={!active || isBusy}
										className="h-10"
									/>
								</div>
							)}
							<div>
								<div className="mb-1 flex items-center gap-2">
									<LabelField id="clear-messages-channel" label="Channel" />
									{channelsQuery.isFetching && (
										<LoadingIndicator
											label="Loading channels"
											inline
											size={60}
											rows={1}
											columns={5}
										/>
									)}
								</div>
								<Select
									id="clear-messages-channel"
									value={channelId}
									onChange={(value) => updateFilter(() => setChannelId(value))}
									data={[
										{ key: "", label: "Select a channel" },
										...channels.map((channel) => ({
											key: channel.id,
											label: `#${channel.name}${channel.parent?.name ? ` · ${channel.parent.name}` : ""}`,
										})),
									]}
									disabled={
										!active ||
										isBusy ||
										!guildId ||
										channelsQuery.isFetching ||
										channelsQuery.isError
									}
									className="h-10"
								/>
								{channelsQuery.isError && (
									<p role="alert" className="mt-1 text-sm text-destructive">
										{getErrorMessage(channelsQuery.error, "Could not load channels.")}
									</p>
								)}
								{channelsQuery.isSuccess && channels.length === 0 && (
									<p className="mt-1 text-xs text-muted-foreground">
										No supported message channels found.
									</p>
								)}
							</div>
							<div>
								<LabelField id="clear-messages-count" label="Maximum messages" className="mb-1" />
								<Input
									id="clear-messages-count"
									type="number"
									min={1}
									max={100}
									step={1}
									value={countInput}
									onChange={(event) => updateFilter(() => setCountInput(event.target.value))}
									disabled={!active || isBusy}
									className="w-full"
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									Up to 100 matches from the latest 100 messages.
								</p>
							</div>
							<div>
								<LabelField id="clear-messages-text" label="Text contains" className="mb-1" />
								<Input
									id="clear-messages-text"
									value={text}
									onChange={(event) => updateFilter(() => setText(event.target.value))}
									placeholder="Case-sensitive text filter"
									maxLength={2000}
									disabled={!active || isBusy}
									className="w-full"
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									Messages containing this exact text will match.
								</p>
							</div>
							<div className="sm:col-span-2">
								<LabelField
									id="clear-messages-member"
									label="Message author (optional)"
									className="mb-1"
								/>
								{selectedMember ? (
									<div className="flex flex-wrap items-center gap-3">
										<span className="text-sm">
											{selectedMember.displayName}{" "}
											<span className="text-muted-foreground">@{selectedMember.username}</span>
										</span>
										<Button
											size="sm"
											variant="outline-secondary"
											disabled={!active || isBusy}
											onClick={() => updateFilter(() => setSelectedMember(null))}
										>
											Remove author filter
										</Button>
									</div>
								) : (
									<GuildMemberPicker
										id="clear-messages-member"
										guildId={guildId}
										enabled={active && Boolean(guildId)}
										disabled={!guildId || isBusy}
										onSelect={(member) => updateFilter(() => setSelectedMember(member))}
									/>
								)}
							</div>
						</div>
					)}
					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant="outline-primary"
							disabled={!active || !canPreview || isBusy}
							onClick={() => previewMutation.mutate()}
						>
							{previewMutation.isPending ? "Preparing preview..." : "Preview messages"}
						</Button>
						{previewMutation.isError && (
							<p role="alert" className="text-sm text-destructive">
								{getErrorMessage(previewMutation.error, "Could not create a message preview.")}
							</p>
						)}
					</div>
				</Card.Content>
			</Card>

			{preview && (
				<Card hoverable={false} className="rounded-md border-border">
					<Card.Content className="space-y-4 p-4!">
						<div>
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="font-semibold">Preview for #{preview.channel.name}</h3>
								<Tag variant="secondary" size="sm">
									{preview.deleteCount} selected
								</Tag>
							</div>
							<p className="mt-1 text-sm text-muted-foreground">
								Scanned {preview.scannedCount}; found {preview.matchedCount} matching message
								{preview.matchedCount === 1 ? "" : "s"}.
							</p>
						</div>
						{preview.scanLimitReached && (
							<p role="status" className="text-sm text-warning">
								Only the newest 100 messages were scanned. Older matching messages are not included.
							</p>
						)}
						{preview.olderThanBulkDeleteLimit > 0 && (
							<p role="status" className="text-sm text-warning">
								{preview.olderThanBulkDeleteLimit} message
								{preview.olderThanBulkDeleteLimit === 1 ? "" : "s"}{" "}
								{preview.olderThanBulkDeleteLimit === 1 ? "is" : "are"} older than 14 days and will be
								deleted individually; this may take longer.
							</p>
						)}
						{preview.messages.length > 0 ? (
							<ul className="max-h-96 space-y-2 overflow-y-auto">
								{preview.messages.map((message) => (
									<li key={message.id} className="rounded-md border border-border p-3">
										<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
											<span className="font-medium">
												{message.author.displayName} (@{message.author.username})
											</span>
											<a
												href={message.jumpUrl}
												target="_blank"
												rel="noreferrer"
												className="text-muted-foreground underline hover:text-primary"
											>
												{new Date(message.createdTimestampMs).toLocaleString()}
											</a>
										</div>
										<p className="mt-2 wrap-break-word whitespace-pre-wrap text-sm">
											{message.content}
										</p>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">No messages match these filters.</p>
						)}
						{preview.matchedCount > preview.deleteCount && (
							<p className="text-xs text-muted-foreground">
								Only the newest {preview.deleteCount} of {preview.matchedCount} matches will be deleted.
							</p>
						)}
						{preview.deleteCount > 0 && (
							<div className="space-y-3 border-t border-border pt-3">
								<label className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										checked={confirmationChecked}
										onChange={(event) => setConfirmationChecked(event.target.checked)}
										disabled={clearMutation.isPending}
										className="mt-1 size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
									/>
									<span>
										I reviewed the preview and understand that {preview.deleteCount}{" "}
										{preview.deleteCount === 1 ? "message" : "messages"} will be permanently
										deleted.
									</span>
								</label>
								<div className="flex flex-wrap items-center gap-3">
									<Button
										variant="destructive"
										disabled={!confirmationChecked || clearMutation.isPending}
										onClick={() => clearMutation.mutate()}
									>
										{clearMutation.isPending
											? "Starting deletion..."
											: `Delete ${preview.deleteCount} ${preview.deleteCount === 1 ? "message" : "messages"}`}
									</Button>
									<Button
										variant="outline-secondary"
										disabled={clearMutation.isPending}
										onClick={() => {
											setPreview(null);
											setConfirmationChecked(false);
										}}
									>
										Cancel
									</Button>
								</div>
								{clearMutation.isError && (
									<p role="alert" className="text-sm text-destructive">
										{getErrorMessage(clearMutation.error, "Could not start message deletion.")}
									</p>
								)}
							</div>
						)}
					</Card.Content>
				</Card>
			)}
		</section>
	);
}
