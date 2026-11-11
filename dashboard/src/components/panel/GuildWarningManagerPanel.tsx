import { Avatar, Button, Card, DateHandler, Input, Table, type TableColumnDef } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useRef, useState } from "react";
import { FiAlertCircle, FiInfo, FiUser } from "react-icons/fi";
import { toast } from "sonner";

import APIHandler, { type WarningIssueResult, type WarningRecord } from "@jappan/handlers/APIHandler";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildWarningsTable from "@jappan/components/panel/GuildWarningsTable";
import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";
import UserDisplay from "@jappan/components/display/UserDisplay";

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not update warnings. Please try again.";
}

function issueSuccessMessage(result: WarningIssueResult): string {
	switch (result.action) {
		case "banned":
			return `Warning issued. Member was banned at ${result.warningCount} warnings.`;
		case "timed_out":
			return `Warning issued. Member was timed out at ${result.warningCount} warnings.`;
		case "ban_failed":
			return `Warning recorded (${result.warningCount}), but the member could not be banned.`;
		case "timeout_failed":
			return `Warning recorded (${result.warningCount}), but the member could not be timed out.`;
		case "none":
			return `Warning issued. Member now has ${result.warningCount} warnings.`;
	}
}

export default function GuildWarningManagerPanel({
	guildId,
	active,
	isActiveMember,
}: {
	guildId: string;
	active: boolean;
	isActiveMember: boolean;
}) {
	const queryClient = useQueryClient();
	const panelHeading = useRef<HTMLHeadingElement>(null);
	const [memberId, setMemberId] = useState("");
	const [reason, setReason] = useState("");
	const memberQuery = useQuery({
		queryKey: ["user", "guild", guildId, "warnings", memberId],
		queryFn: () => APIHandler.getGuildMemberWarnings(guildId, memberId),
		enabled: active && isActiveMember && memberId !== "",
		retry: false,
	});
	const refreshWarnings = () => queryClient.invalidateQueries({ queryKey: ["user", "guild", guildId, "warnings"] });
	const issueMutation = useMutation({
		mutationFn: () => {
			const promise = APIHandler.issueGuildMemberWarning(guildId, memberId, reason.trim());
			toast.promise(promise, {
				loading: "Issuing warning…",
				success: issueSuccessMessage,
				error: getErrorMessage,
			});
			return promise;
		},
		onSuccess: async () => {
			setReason("");
			await refreshWarnings();
		},
	});
	const deleteMutation = useMutation({
		mutationFn: (warningId: string) => {
			const promise = APIHandler.deleteGuildMemberWarning(guildId, memberId, warningId);
			toast.promise(promise, {
				loading: "Deleting warning…",
				success: "Warning deleted.",
				error: getErrorMessage,
			});
			return promise;
		},
		onSuccess: refreshWarnings,
	});
	const busy = issueMutation.isPending || deleteMutation.isPending;
	const unavailable = busy || !active || !isActiveMember;
	const selectedMember = memberQuery.data;
	const cannotIssue = unavailable || selectedMember?.isGuildMember !== true;
	const selectMember = (userId: string) => {
		setMemberId(userId);
		setReason("");
	};
	const columns: TableColumnDef<WarningRecord>[] = [
		{
			accessorKey: "reason",
			header: "Reason",
			size: 320,
			mobileFullWidth: true,
			filterFn: "includesString",
			cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.reason}</span>,
		},
		{
			accessorKey: "issuedAt",
			header: "Issued",
			size: 210,
			filterFn: "includesString",
			cell: ({ row }) =>
				row.original.issuedAt ? (
					<div>
						<span className="block">{DateHandler.getDateTime(row.original.issuedAt)}</span>
						<span className="block text-xs text-muted-foreground">
							{DateHandler.getRelativeTime(row.original.issuedAt)}
						</span>
					</div>
				) : (
					"Unknown"
				),
		},
		{
			id: "issuer",
			accessorFn: (warning) =>
				[warning.issuer?.username, warning.issuerId].filter(Boolean).join(" ") || "Unknown",
			header: "Issuer",
			size: 260,
			filterFn: "includesString",
			cell: ({ row }) => {
				const issuer = row.original.issuer;
				return issuer?.username ? (
					<UserDisplay id={issuer.userId} name={issuer.username} avatarUrl={issuer.avatarUrl} size="sm" />
				) : (
					<span className="break-all">{row.original.issuerId ?? "Unknown"}</span>
				);
			},
		},
		{
			id: "thresholdAction",
			accessorFn: (warning) => warning.thresholdAction.replace(/_/gu, " "),
			header: "Threshold action",
			size: 170,
			filterFn: "includesString",
			cell: ({ row }) => <span className="capitalize">{row.original.thresholdAction.replace(/_/gu, " ")}</span>,
		},
		{
			id: "actions",
			accessorFn: (warning) => warning.id,
			header: "Actions",
			size: 110,
			enableSorting: false,
			enableColumnFilter: false,
			enableHiding: false,
			cell: ({ row }) => (
				<Button
					type="button"
					size="sm"
					variant="outline-secondary"
					disabled={unavailable || row.original.thresholdAction === "pending"}
					aria-label={`Delete warning: ${row.original.reason}`}
					onClick={() => deleteMutation.mutate(row.original.id)}
				>
					Delete
				</Button>
			),
		},
	];

	return (
		<div className="space-y-5">
			<Card id="warnings" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2
							ref={panelHeading}
							tabIndex={-1}
							className="scroll-mt-24 text-lg font-semibold focus-visible:ring-2 focus-visible:ring-ring"
						>
							Manage warnings
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Review a member's history and manage individual warnings.
						</p>
					</div>
					<div className="w-full sm:max-w-sm">
						<GuildMemberPicker
							id="warning-member-search"
							guildId={guildId}
							enabled={active && isActiveMember}
							disabled={busy}
							selectedMemberId={memberId}
							onSelect={(member) => selectMember(member.id)}
						/>
					</div>
				</div>
				{!isActiveMember && (
					<p role="alert" className="mt-4 text-sm text-destructive">
						The bot is not a member of this guild. Warning actions are unavailable.
					</p>
				)}
				{!memberId ? (
					<div className="mt-5 flex flex-col items-center rounded-md border border-dashed border-border px-3 py-8 text-center">
						<FiUser className="size-6 text-muted-foreground" aria-hidden="true" />
						<p className="mt-3 font-medium">Select a member to review their warnings</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Search above or select a warning count in the list below.
						</p>
					</div>
				) : (
					<div className="mt-5 space-y-5">
						{memberQuery.isFetching && (
							<LoadingIndicator label="Loading member warnings" inline size={80} rows={1} columns={5} />
						)}
						{memberQuery.isError && (
							<div role="alert" className="flex flex-wrap items-center gap-3">
								<p className="text-sm text-destructive">{getErrorMessage(memberQuery.error)}</p>
								<Button
									size="sm"
									variant="outline-primary"
									disabled={memberQuery.isFetching}
									onClick={() => void memberQuery.refetch()}
								>
									Retry
								</Button>
							</div>
						)}
						{selectedMember && (
							<>
								<div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
									<Avatar
										name={selectedMember.displayName}
										image={selectedMember.avatarUrl}
										size="md"
										aria-hidden="true"
									/>
									<div className="min-w-0">
										<h3 className="truncate font-semibold">{selectedMember.displayName}</h3>
										<p className="truncate text-sm text-muted-foreground">
											@{selectedMember.username}
										</p>
									</div>
									<span className="ml-auto inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 font-medium text-primary">
										<FiAlertCircle aria-hidden="true" />
										{selectedMember.warningCount} warning(s)
									</span>
								</div>
								{!selectedMember.isGuildMember && (
									<Card hoverable={false} className="rounded-md border-border">
										<Card.Content
											role="status"
											className="flex items-center justify-start gap-3 p-0! text-left text-sm"
										>
											<FiInfo className="size-5 shrink-0 text-primary" aria-hidden="true" />
											<span>
												This user is no longer in the guild.
												<br />
												You can review and delete their warnings, but cannot issue new ones.
											</span>
										</Card.Content>
									</Card>
								)}
								{selectedMember.isGuildMember && (
									<form
										className="space-y-3"
										onSubmit={(event) => {
											event.preventDefault();
											if (!cannotIssue) issueMutation.mutate();
										}}
									>
										<div>
											<h3 className="font-semibold">Issue a warning</h3>
											<p className="mt-1 text-sm text-muted-foreground">
												Threshold actions and audit logging follow Service Preferences.
											</p>
										</div>
										<label htmlFor="warning-reason" className="block text-sm font-medium">
											Reason (optional)
										</label>
										<div className="flex flex-col items-start gap-3 sm:flex-row">
											<Input
												as="textarea"
												id="warning-reason"
												rows={2}
												value={reason}
												onChange={(event) => setReason(event.target.value)}
												maxLength={500}
												disabled={cannotIssue}
												placeholder="No reason provided"
												className="w-full flex-1"
											/>
											<Button
												type="submit"
												size="sm"
												variant="outline-primary"
												disabled={cannotIssue}
											>
												{issueMutation.isPending ? "Issuing..." : "Issue warning"}
											</Button>
										</div>
									</form>
								)}
								<section
									aria-labelledby="warning-history-heading"
									className="min-w-0 border-t border-border pt-5"
								>
									<h3 id="warning-history-heading" className="font-semibold">
										Warning history
									</h3>
									<p className="mt-1 mb-4 text-sm text-muted-foreground">
										Filter or sort to find a warning. Deleting permanently removes it and lowers the
										active count.
									</p>
									{selectedMember.warnings.length > 0 ? (
										<Table
											key={memberId}
											data={selectedMember.warnings.slice().reverse()}
											columnDef={columns}
										/>
									) : (
										<p className="text-sm text-muted-foreground">No active warnings.</p>
									)}
								</section>
							</>
						)}
					</div>
				)}
			</Card>
			<GuildWarningsTable
				guildId={guildId}
				active={active}
				isActiveMember={isActiveMember}
				disabled={busy}
				onSelectMember={(userId) => {
					selectMember(userId);
					panelHeading.current?.focus({ preventScroll: true });
					panelHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
				}}
			/>
		</div>
	);
}
