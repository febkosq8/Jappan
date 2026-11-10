import { Avatar, Button, Card, Input } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { FiAlertCircle, FiSearch, FiUser } from "react-icons/fi";
import { toast } from "sonner";

import APIHandler, { type WarningIssueResult } from "@jappan/handlers/APIHandler";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildWarningsTable from "@jappan/components/guild/GuildWarningsTable";

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

export default function WarningManager({
	guildId,
	active,
	isActiveMember,
}: {
	guildId: string;
	active: boolean;
	isActiveMember: boolean;
}) {
	const queryClient = useQueryClient();
	const memberListboxId = useId();
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [activeMemberIndex, setActiveMemberIndex] = useState(-1);
	const [memberId, setMemberId] = useState("");
	const [reason, setReason] = useState("");
	const [overrideValue, setOverrideValue] = useState("");
	const warningsQueryKey = ["user", "guild", guildId, "warnings", memberId];

	useEffect(() => {
		const timeoutId = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
		return () => window.clearTimeout(timeoutId);
	}, [searchInput]);

	const membersQuery = useQuery({
		queryKey: ["user", "guild", guildId, "members", searchQuery],
		queryFn: () => APIHandler.searchGuildMembers(guildId, searchQuery || undefined),
		enabled: active && isActiveMember && (searchQuery.length === 0 || searchQuery.length >= 2),
		retry: false,
	});
	const memberQuery = useQuery({
		queryKey: warningsQueryKey,
		queryFn: () => APIHandler.getGuildMemberWarnings(guildId, memberId),
		enabled: active && isActiveMember && memberId !== "",
		retry: false,
	});

	useEffect(() => {
		setOverrideValue(memberQuery.data?.warningCount.toString() ?? "");
	}, [memberQuery.data]);

	const issueMutation = useMutation({
		mutationFn: () => APIHandler.issueGuildMemberWarning(guildId, memberId, reason.trim()),
		onSuccess: async (result) => {
			if (result.action === "ban_failed" || result.action === "timeout_failed") {
				toast.warning(issueSuccessMessage(result));
			} else {
				toast.success(issueSuccessMessage(result));
			}
			await queryClient.invalidateQueries({ queryKey: ["user", "guild", guildId, "warnings"] });
		},
		onError: (error: unknown) => toast.error(getErrorMessage(error)),
	});
	const overrideMutation = useMutation({
		mutationFn: () => APIHandler.overrideGuildMemberWarnings(guildId, memberId, Number(overrideValue)),
		onSuccess: async (warningCount) => {
			toast.success(`Warning count updated to ${warningCount}.`);
			await queryClient.invalidateQueries({ queryKey: ["user", "guild", guildId, "warnings"] });
		},
		onError: (error: unknown) => toast.error(getErrorMessage(error)),
	});

	const selectedMember = memberQuery.data;
	const matchingMembers = membersQuery.data ?? [];
	const normalizedSearchInput = searchInput.trim();
	const searchIsSettled = normalizedSearchInput === searchQuery;
	const memberDropdownOpen =
		searchOpen && searchIsSettled && (normalizedSearchInput.length === 0 || normalizedSearchInput.length >= 2);
	const activeMember = memberDropdownOpen ? matchingMembers[activeMemberIndex] : undefined;
	const busy = issueMutation.isPending || overrideMutation.isPending;
	const parsedOverride = Number(overrideValue);
	const canOverride = overrideValue.trim() !== "" && Number.isSafeInteger(parsedOverride) && parsedOverride >= 0;

	const selectMember = (selectedMemberId: string) => {
		setMemberId(selectedMemberId);
		setSearchInput("");
		setSearchQuery("");
		setSearchOpen(false);
		setActiveMemberIndex(-1);
	};

	const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" && matchingMembers.length > 0) {
			event.preventDefault();
			setSearchOpen(true);
			setActiveMemberIndex((index) => (index + 1) % matchingMembers.length);
		} else if (event.key === "ArrowUp" && matchingMembers.length > 0) {
			event.preventDefault();
			setActiveMemberIndex((index) => (index <= 0 ? matchingMembers.length - 1 : index - 1));
		} else if (event.key === "Enter" && activeMember) {
			event.preventDefault();
			selectMember(activeMember.id);
		} else if (event.key === "Escape") {
			setSearchOpen(false);
			setActiveMemberIndex(-1);
		}
	};

	return (
		<div className="space-y-5">
			<Card id="warning-actions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="text-lg font-semibold">Manage warnings</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Select a member to review their warning count, issue a warning, or update the count. Thresholds and
					audit logging are managed in Service Preferences.
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
						<div className="relative">
							<FiSearch
								className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								id="warning-member-search"
								type="search"
								value={searchInput}
								onChange={(event) => {
									setSearchInput(event.target.value);
									setActiveMemberIndex(-1);
									setSearchOpen(true);
								}}
								disabled={!isActiveMember || !active}
								placeholder="Search guild members"
								autoComplete="off"
								role="combobox"
								aria-expanded={memberDropdownOpen}
								aria-controls={memberListboxId}
								aria-autocomplete="list"
								aria-activedescendant={
									activeMember ? `${memberListboxId}-option-${activeMemberIndex}` : undefined
								}
								aria-describedby="warning-member-search-help"
								className="w-full pl-10"
								onFocus={() => setSearchOpen(true)}
								onBlur={() => setSearchOpen(false)}
								onKeyDown={handleSearchKeyDown}
							/>
							{memberDropdownOpen && (
								<ul
									id={memberListboxId}
									role="listbox"
									aria-label={searchQuery ? "Matching guild members" : "Guild members"}
									className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
								>
									{membersQuery.isFetching && (
										<li className="px-3 py-2" role="status">
											<LoadingIndicator
												label="Searching guild members"
												inline
												size={80}
												rows={1}
												columns={5}
											/>
										</li>
									)}
									{membersQuery.isError && (
										<li role="alert" className="px-3 py-2 text-sm text-destructive">
											{getErrorMessage(membersQuery.error)}
										</li>
									)}
									{membersQuery.isSuccess && matchingMembers.length === 0 && (
										<li className="px-3 py-2 text-sm text-muted-foreground">
											{searchQuery ? "No matching members found." : "No guild members found."}
										</li>
									)}
									{!searchQuery && membersQuery.isSuccess && matchingMembers.length > 0 && (
										<li className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
											Showing up to 100 members. Search for anyone else.
										</li>
									)}
									{matchingMembers.map((member, index) => (
										<li
											key={member.id}
											id={`${memberListboxId}-option-${index}`}
											role="option"
											aria-selected={member.id === memberId}
											onMouseDown={(event) => {
												event.preventDefault();
												selectMember(member.id);
											}}
											onMouseEnter={() => setActiveMemberIndex(index)}
											className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
												index === activeMemberIndex ? "bg-accent text-primary" : ""
											}`}
										>
											<Avatar
												name={member.displayName}
												image={member.avatarUrl}
												size="sm"
												aria-hidden="true"
											/>
											<span className="min-w-0">
												<span className="block truncate font-medium">{member.displayName}</span>
												<span className="block truncate text-xs text-muted-foreground">
													@{member.username}
												</span>
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
						<p id="warning-member-search-help" className="mt-1 text-xs text-muted-foreground">
							Up to 100 members load when this tab opens. Search by username or nickname to find others.
						</p>
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
											<div className="flex min-w-0 flex-col rounded-md border border-border p-3">
												<h4 className="font-medium">Adjust warning count</h4>
												<p className="mt-1 text-sm text-muted-foreground">
													Set the member's current total.
												</p>
												<div className="my-3">
													<label
														htmlFor="warning-count-override"
														className="mb-1 block text-sm font-medium"
													>
														New warning count
													</label>
													<Input
														id="warning-count-override"
														type="number"
														inputMode="numeric"
														min={0}
														step={1}
														value={overrideValue}
														onChange={(event) => setOverrideValue(event.target.value)}
														disabled={busy}
														className="w-full"
													/>
												</div>
												<Button
													type="button"
													size="sm"
													variant="outline-secondary"
													className="mt-auto w-full"
													disabled={busy || !canOverride}
													onClick={() => overrideMutation.mutate()}
												>
													{overrideMutation.isPending ? "Saving..." : "Save count"}
												</Button>
											</div>
										</div>
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
