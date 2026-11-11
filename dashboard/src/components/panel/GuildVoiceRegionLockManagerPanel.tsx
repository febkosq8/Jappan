import { Button, Card, LabelField, Select, Table, type TableColumnDef } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type SubmitEvent } from "react";
import { FiMapPin, FiUser } from "react-icons/fi";
import { toast } from "sonner";

import UserDisplay from "@jappan/components/display/UserDisplay";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";
import APIHandler, { type VoiceRegionLock, type WarningMember } from "@jappan/handlers/APIHandler";

function formatVoiceRegion(region: string): string {
	return region.replace(/-/g, " ").replace(/(^|\s)\S/gu, (initial) => initial.toUpperCase());
}

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not manage voice region locks. Please try again.";
}

export default function GuildVoiceRegionLockManagerPanel({
	guildId,
	active,
	isActiveMember,
}: {
	guildId: string;
	active: boolean;
	isActiveMember: boolean;
}) {
	const queryClient = useQueryClient();
	const [selectedMember, setSelectedMember] = useState<WarningMember | null>(null);
	const [channelId, setChannelId] = useState("");
	const [region, setRegion] = useState("");
	const queryKey = ["user", "guild", guildId, "voice-region-locks"];
	const shouldLoad = active && isActiveMember;

	const locksQuery = useQuery({
		queryKey,
		queryFn: () => APIHandler.getGuildVoiceRegionLocks(guildId),
		enabled: shouldLoad,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guildId, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guildId),
		enabled: shouldLoad,
		retry: false,
	});
	const addMutation = useMutation({
		mutationFn: (input: { userId: string; channelId: string; region: string }) => {
			const promise = APIHandler.addGuildVoiceRegionLock(guildId, input);
			toast.promise(promise, {
				loading: "Creating voice region lock…",
				success: "Voice region lock created.",
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async () => {
			setSelectedMember(null);
			await queryClient.invalidateQueries({ queryKey });
		},
	});
	const removeMutation = useMutation({
		mutationFn: (userId: string) => {
			const promise = APIHandler.removeGuildVoiceRegionLock(guildId, userId);
			toast.promise(promise, {
				loading: "Removing voice region lock…",
				success: "Voice region lock removed.",
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	const voiceChannels = (channelsQuery.data ?? []).filter((channel) => channel.typeName === "GuildVoice");
	const regions = locksQuery.data?.regions ?? [];
	const busy = addMutation.isPending || removeMutation.isPending;
	const canSubmit =
		shouldLoad &&
		!busy &&
		!channelsQuery.isError &&
		!locksQuery.isError &&
		!channelsQuery.isFetching &&
		!locksQuery.isFetching &&
		selectedMember !== null &&
		voiceChannels.some((channel) => channel.id === channelId) &&
		regions.includes(region);

	const columns: TableColumnDef<VoiceRegionLock>[] = [
		{
			accessorKey: "userName",
			header: "User",
			mobileFullWidth: true,
			size: 260,
			filterFn: "includesString",
			cell: ({ row }) => (
				<div className="flex min-h-12 items-center py-2">
					<UserDisplay
						id={row.original.userId}
						name={row.original.userName}
						avatarUrl={row.original.avatarUrl}
						size="md"
					/>
				</div>
			),
		},
		{
			accessorKey: "channelName",
			header: "Voice channel",
			size: 240,
			filterFn: "includesString",
			cell: ({ row }) => (
				<ChannelDisplay guildId={guildId} id={row.original.channelId} name={row.original.channelName} />
			),
		},
		{
			accessorKey: "region",
			header: "Region",
			size: 160,
			filterFn: "includesString",
			cell: ({ row }) => formatVoiceRegion(row.original.region),
		},
		{
			id: "actions",
			accessorKey: "userId",
			header: "Actions",
			size: 120,
			enableSorting: false,
			enableColumnFilter: false,
			cell: ({ row }) => (
				<Button
					type="button"
					size="sm"
					variant="outline-secondary"
					disabled={busy || !active}
					aria-label={`Remove voice region lock for ${row.original.userName}`}
					onClick={() => removeMutation.mutate(row.original.userId)}
				>
					{removeMutation.isPending && removeMutation.variables === row.original.userId
						? "Removing..."
						: "Remove"}
				</Button>
			),
		},
	];

	const submit = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit || !selectedMember) return;
		addMutation.mutate({ userId: selectedMember.id, channelId, region });
	};

	return (
		<Card id="voice-region-locks" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="text-lg font-semibold">Manage voice region locks</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Choose a member, voice channel, and region. The region is applied the next time that member joins the
				channel. Each member can have one lock; creating another replaces their existing lock.
			</p>
			{!isActiveMember && (
				<p
					role="alert"
					className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
				>
					The bot is not a member of this guild. Voice region locks are unavailable.
				</p>
			)}
			{isActiveMember && channelsQuery.isError && (
				<div role="alert" className="mt-4 space-y-2">
					<p className="text-sm text-destructive">{getErrorMessage(channelsQuery.error)}</p>
					<Button
						size="sm"
						variant="outline-primary"
						disabled={channelsQuery.isFetching}
						onClick={() => void channelsQuery.refetch()}
					>
						Retry loading channels
					</Button>
				</div>
			)}
			{isActiveMember && locksQuery.isError && (
				<div role="alert" className="mt-4 space-y-2">
					<p className="text-sm text-destructive">{getErrorMessage(locksQuery.error)}</p>
					<Button
						size="sm"
						variant="outline-primary"
						disabled={locksQuery.isFetching}
						onClick={() => void locksQuery.refetch()}
					>
						Retry loading locks
					</Button>
				</div>
			)}
			{isActiveMember && (
				<>
					<form onSubmit={submit} className="mt-5 space-y-4 rounded-md border border-border p-4 sm:p-5">
						<h3 className="font-semibold">Create a lock</h3>
						<fieldset disabled={!active || busy} className="grid gap-4 sm:grid-cols-2">
							<div className="min-w-0">
								{selectedMember ? (
									<>
										<p id="voice-region-lock-member-label" className="mb-1 text-sm font-medium">
											Member to watch
										</p>
										<div className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
											<UserDisplay
												id={selectedMember.id}
												name={selectedMember.displayName}
												avatarUrl={selectedMember.avatarUrl}
												size="sm"
											/>
											<Button
												type="button"
												size="sm"
												variant="outline-secondary"
												onClick={() => setSelectedMember(null)}
											>
												Change
											</Button>
										</div>
									</>
								) : (
									<>
										<LabelField
											id="voice-region-lock-member-search"
											label="Member to watch"
											className="mb-1"
										/>
										<GuildMemberPicker
											id="voice-region-lock-member-search"
											guildId={guildId}
											enabled={shouldLoad}
											disabled={busy}
											onSelect={setSelectedMember}
										/>
									</>
								)}
							</div>
							<div>
								<LabelField id="voice-region-lock-channel" label="Voice channel" className="mb-1" />
								<Select
									id="voice-region-lock-channel"
									value={channelId}
									onChange={setChannelId}
									data={[
										{ key: "", label: "Select a voice channel" },
										...voiceChannels.map((channel) => ({
											key: channel.id,
											label: `#${channel.name} (${channel.id})`,
										})),
									]}
									disabled={!active || busy || channelsQuery.isFetching || channelsQuery.isError}
									className="h-10"
								/>
								{channelsQuery.isSuccess && voiceChannels.length === 0 && (
									<p className="mt-1 text-xs text-muted-foreground">
										No voice channels are available.
									</p>
								)}
							</div>
							<div>
								<LabelField id="voice-region-lock-region" label="Region" className="mb-1" />
								<Select
									id="voice-region-lock-region"
									value={region}
									onChange={setRegion}
									data={[
										{ key: "", label: "Select a region" },
										...regions.map((regionId) => ({
											key: regionId,
											label: formatVoiceRegion(regionId),
										})),
									]}
									disabled={!active || busy || locksQuery.isFetching || locksQuery.isError}
									className="h-10"
								/>
							</div>
							<div className="flex items-end">
								<Button
									type="submit"
									size="sm"
									variant="outline-primary"
									className="w-full"
									disabled={!canSubmit || channelsQuery.isError || locksQuery.isError}
								>
									{addMutation.isPending ? "Creating..." : "Create voice region lock"}
								</Button>
							</div>
						</fieldset>
					</form>
					<section aria-labelledby="voice-region-lock-list-heading" className="mt-6">
						<div className="flex items-center gap-2">
							<FiMapPin className="size-4 text-muted-foreground" aria-hidden="true" />
							<h3 id="voice-region-lock-list-heading" className="font-semibold">
								Existing locks
							</h3>
							{locksQuery.isFetching && (
								<LoadingIndicator
									label="Loading voice region locks"
									inline
									size={60}
									rows={1}
									columns={5}
								/>
							)}
						</div>
						{locksQuery.isSuccess &&
							(locksQuery.data.locks.length > 0 ? (
								<div className="mt-3">
									<Table data={locksQuery.data.locks} columnDef={columns} />
								</div>
							) : (
								<div className="mt-3 flex flex-col items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center">
									<span className="inline-flex size-10 items-center justify-center rounded-md bg-accent text-muted-foreground">
										<FiUser className="size-5" aria-hidden="true" />
									</span>
									<p className="mt-3 font-medium">No voice region locks are configured.</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Create a lock above to apply a region when a member joins a voice channel.
									</p>
								</div>
							))}
					</section>
				</>
			)}
		</Card>
	);
}
