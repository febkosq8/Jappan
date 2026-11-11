import { Avatar, Button, Card, Input } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { FiAlertCircle, FiUser } from "react-icons/fi";
import { toast } from "sonner";

import APIHandler, { type WarningIssueResult } from "@jappan/handlers/APIHandler";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildWarningsTable from "@jappan/components/panel/GuildWarningsTable";
import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";

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
	const [memberId, setMemberId] = useState("");
	const [reason, setReason] = useState("");
	const warningsQueryKey = ["user", "guild", guildId, "warnings", memberId];

	const memberQuery = useQuery({
		queryKey: warningsQueryKey,
		queryFn: () => APIHandler.getGuildMemberWarnings(guildId, memberId),
		enabled: active && isActiveMember && memberId !== "",
		retry: false,
	});

	const issueMutation = useMutation({
		mutationFn: () => {
			const promise = APIHandler.issueGuildMemberWarning(guildId, memberId, reason.trim());
			toast.promise(promise, {
				loading: "Issuing warning…",
				success: issueSuccessMessage,
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["user", "guild", guildId, "warnings"] });
		},
	});
	const deleteMutation = useMutation({
		mutationFn: (warningId: string) => {
			const promise = APIHandler.deleteGuildMemberWarning(guildId, memberId, warningId);
			toast.promise(promise, {
				loading: "Deleting warning…",
				success: "Warning deleted.",
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["user", "guild", guildId, "warnings"] });
		},
	});

	const selectedMember = memberQuery.data;
	const busy = issueMutation.isPending || deleteMutation.isPending;

	return (
		<div className="space-y-5">
			<Card id="warnings" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="text-lg font-semibold">Manage warnings</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Select a member to review warning history, issue a warning, or remove an individual warning.
					Thresholds and audit logging are managed in Service Preferences.
				</p>
				{!isActiveMember && (
					<p
						role="alert"
						className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
					>
						The bot is not a member of this guild. Warning actions are unavailable.
					</p>
				)}
				<div className="mt-4 grid gap-5 lg:grid-cols-[minmax(15rem,0.85fr)_minmax(0,1.4fr)]">
					<section aria-labelledby="warning-member-heading" className="min-w-0">
						<div className="mb-2">
							<h3 id="warning-member-heading" className="font-semibold">
								Find a member
							</h3>
							<p className="text-sm text-muted-foreground">Search by username or server nickname.</p>
						</div>
						<GuildMemberPicker
							id="warning-member-search"
							guildId={guildId}
							enabled={active && isActiveMember}
							selectedMemberId={memberId}
							onSelect={(member) => setMemberId(member.id)}
						/>
					</section>

					<section
						aria-labelledby="warning-member-actions-heading"
						className="min-w-0 rounded-md border border-border bg-card p-4 sm:p-5"
					>
						<h3 id="warning-member-actions-heading" className="font-semibold">
							Member warning details
						</h3>
						{!memberId && (
							<div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center">
								<span className="inline-flex size-10 items-center justify-center rounded-md bg-accent text-muted-foreground">
									<FiUser className="size-5" aria-hidden="true" />
								</span>
								<p className="mt-3 font-medium">Choose a member to get started</p>
								<p className="mt-1 max-w-xs text-sm text-muted-foreground">
									Their warning count and available actions will appear here.
								</p>
							</div>
						)}
						{memberId && (
							<div className="mt-4 space-y-4">
								{memberQuery.isFetching && (
									<LoadingIndicator
										label="Loading member warnings"
										inline
										decorative
										size={80}
										rows={1}
										columns={5}
									/>
								)}
								{memberQuery.isError && (
									<p
										role="alert"
										className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
									>
										{getErrorMessage(memberQuery.error)}
									</p>
								)}
								{selectedMember && (
									<>
										<div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
											<Avatar
												name={selectedMember.displayName}
												image={selectedMember.avatarUrl}
												size="md"
												aria-hidden="true"
											/>
											<div className="min-w-0">
												<p className="truncate font-semibold">{selectedMember.displayName}</p>
												<p className="truncate text-sm text-muted-foreground">
													@{selectedMember.username}
												</p>
											</div>
											<div className="ml-auto flex min-w-28 items-center gap-2 rounded-md bg-accent px-3 py-2 text-primary">
												<FiAlertCircle className="size-4 shrink-0" aria-hidden="true" />
												<div>
													<span className="block text-xs font-medium">Warnings</span>
													<span className="block text-lg font-bold tabular-nums leading-tight">
														{selectedMember.warningCount}
													</span>
												</div>
											</div>
										</div>

										<div className="grid gap-3 sm:grid-cols-2">
											<div className="flex min-w-0 flex-col rounded-md border border-border p-3">
												<h4 className="font-medium">Issue a warning</h4>
												<p className="mt-1 text-sm text-muted-foreground">
													Add a reason for the audit log.
												</p>
												<div className="my-3">
													<label
														htmlFor="warning-reason"
														className="mb-1 block text-sm font-medium"
													>
														Reason
													</label>
													<Input
														as="textarea"
														id="warning-reason"
														rows={4}
														value={reason}
														onChange={(event) => setReason(event.target.value)}
														maxLength={500}
														disabled={busy}
														placeholder="No reason provided"
														className="min-h-24 w-full"
													/>
												</div>
												<Button
													type="button"
													size="sm"
													variant="outline-primary"
													className="mt-auto w-full"
													disabled={busy}
													onClick={() => issueMutation.mutate()}
												>
													{issueMutation.isPending ? "Issuing..." : "Issue warning"}
												</Button>
											</div>
										</div>
										<section
											aria-labelledby="warning-history-heading"
											className="rounded-md border border-border p-3"
										>
											<div className="flex flex-wrap items-baseline justify-between gap-2">
												<h4 id="warning-history-heading" className="font-medium">
													Warning history
												</h4>
												<span className="text-sm text-muted-foreground">
													{selectedMember.warningCount} active warning(s)
												</span>
											</div>
											{selectedMember.warnings.length > 0 ? (
												<ol className="mt-3 space-y-3">
													{selectedMember.warnings
														.slice()
														.reverse()
														.map((warning) => (
															<li
																key={warning.id}
																className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
															>
																<div className="min-w-0 flex-1 space-y-1">
																	<p className="break-words font-medium">
																		{warning.reason}
																	</p>
																	<p className="text-sm text-muted-foreground">
																		{warning.issuedAt
																			? new Date(
																					warning.issuedAt,
																				).toLocaleString()
																			: "Date unknown"}
																		{" · "}
																		Issuer: {warning.issuerId ?? "Unknown"}
																	</p>
																	<p className="text-sm text-muted-foreground">
																		Threshold action:{" "}
																		{warning.thresholdAction.replace(/_/gu, " ")}
																	</p>
																</div>
																<Button
																	type="button"
																	size="sm"
																	variant="outline-secondary"
																	disabled={
																		busy || warning.thresholdAction === "pending"
																	}
																	aria-label={`Delete warning: ${warning.reason}`}
																	onClick={() => deleteMutation.mutate(warning.id)}
																>
																	Delete
																</Button>
															</li>
														))}
												</ol>
											) : (
												<p className="mt-3 text-sm text-muted-foreground">
													No active warnings.
												</p>
											)}
										</section>
									</>
								)}
							</div>
						)}
					</section>
				</div>
			</Card>
			<GuildWarningsTable guildId={guildId} active={active} isActiveMember={isActiveMember} />
		</div>
	);
}
