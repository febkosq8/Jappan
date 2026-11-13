import { Button, Card, Input, LabelField, Select, Switch } from "@febkosq8/arc";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type WarningMember } from "@jappan/handlers/APIHandler";

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
	const [regex, setRegex] = useState(false);
	const [ignoreCase, setIgnoreCase] = useState(false);
	const [selectedMember, setSelectedMember] = useState<WarningMember | null>(null);

	useEffect(() => {
		setGuildId(initialGuildId);
		setChannelId("");
		setSelectedMember(null);
	}, [initialGuildId]);

	const guildsQuery = useQuery({
		queryKey: ["user", "guilds", "manager"],
		queryFn: APIHandler.getManagedGuilds,
		enabled: active && !initialGuildId,
		retry: false,
	});
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guildId, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guildId),
		enabled: active && Boolean(guildId),
		retry: false,
	});
	const createMutation = useMutation({
		mutationFn: () => {
			const promise = Promise.resolve().then(() => {
				if (!guildId) throw new Error("Select a server first.");
				const count = Number(countInput);
				if (!Number.isInteger(count) || count < 1 || count > 200) {
					throw new Error("Enter a message limit between 1 and 200.");
				}
				return APIHandler.createGuildMessageClearJob(guildId, {
					...(channelId ? { channelId } : {}),
					count,
					...(selectedMember ? { userId: selectedMember.id } : {}),
					...(text ? { text } : {}),
					regex,
					ignoreCase,
				});
			});
			toast.promise(promise, {
				loading: "Creating message clear job…",
				success: "Clear job created.",
				error: (error) => getErrorMessage(error, "Could not create a message clear job."),
			});
			return promise;
		},
		onSuccess: (result) => {
			navigate(`/clear-jobs/${encodeURIComponent(result.jobId)}`);
		},
	});
	const channels = (channelsQuery.data ?? []).filter((channel) => clearableChannelTypes.has(channel.typeName));
	const count = Number(countInput);
	const canCreate = Boolean(guildId) && Number.isInteger(count) && count >= 1 && count <= 200;
	const isBusy = createMutation.isPending;
	const updateFilter = (update: () => void) => {
		update();
		createMutation.reset();
	};

	return (
		<section aria-labelledby="clear-messages-heading" className="space-y-4">
			<div>
				<h2 id="clear-messages-heading" className="text-xl font-semibold">
					Clear messages
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Create a job to preview messages and confirm deletion on its job page.
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
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{!initialGuildId && (
								<div className="col-span-full">
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
									<LabelField id="clear-messages-channel" label="Channel (optional)" />
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
										{ key: "", label: "All channels" },
										...channels.map((channel) => ({
											key: channel.id,
											label: `#${channel.name} (${channel.id}) | ${channel.parent ? (channel.parent.name ?? "Unavailable category") : "Uncategorized"}`,
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
									max={200}
									step={1}
									value={countInput}
									onChange={(event) => updateFilter(() => setCountInput(event.target.value))}
									disabled={!active || isBusy}
									className="w-full"
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									Up to 200 messages total across the selected scope.
								</p>
							</div>
							<div>
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
							<div className="col-span-full">
								<div className="mb-1 flex flex-wrap items-center justify-between gap-3">
									<LabelField
										id="clear-messages-text"
										label={regex ? "Text matches" : "Text contains"}
									/>
									<div className="flex flex-wrap items-center gap-4">
										<label className="flex items-center gap-2 text-sm">
											<Switch
												checked={regex}
												onChange={(checked) => updateFilter(() => setRegex(checked))}
												disabled={!active || isBusy}
												aria-label="Regex"
											/>
											<span>Regex</span>
										</label>
										<label className="flex items-center gap-2 text-sm">
											<Switch
												checked={ignoreCase}
												onChange={(checked) => updateFilter(() => setIgnoreCase(checked))}
												disabled={!active || isBusy}
												aria-label="Ignore case"
											/>
											<span>Ignore case</span>
										</label>
									</div>
								</div>
								<Input
									as="textarea"
									id="clear-messages-text"
									rows={2}
									value={text}
									onChange={(event) => updateFilter(() => setText(event.target.value))}
									placeholder={regex ? "RE2 pattern, without /.../ delimiters" : "Text filter"}
									maxLength={2000}
									disabled={!active || isBusy}
									className="w-full"
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									{regex
										? "Safe RE2 syntax; no lookarounds or backreferences."
										: "Matches messages containing this text."}
								</p>
							</div>
						</div>
					)}
					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant="outline-primary"
							disabled={!active || !canCreate || isBusy}
							onClick={() => createMutation.mutate()}
						>
							{createMutation.isPending ? "Creating job..." : "Start clear job"}
						</Button>
					</div>
				</Card.Content>
			</Card>
		</section>
	);
}
