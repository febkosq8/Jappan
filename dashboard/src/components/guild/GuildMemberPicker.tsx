import { Avatar, Input } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { FiSearch } from "react-icons/fi";

import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type WarningMember } from "@jappan/handlers/APIHandler";

export default function GuildMemberPicker({
	id,
	guildId,
	enabled,
	disabled = false,
	selectedMemberId,
	onSelect,
}: {
	id: string;
	guildId: string;
	enabled: boolean;
	disabled?: boolean;
	selectedMemberId?: string;
	onSelect: (member: WarningMember) => void;
}) {
	const listboxId = useId();
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [activeMemberIndex, setActiveMemberIndex] = useState(-1);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
		return () => window.clearTimeout(timeoutId);
	}, [searchInput]);

	const membersQuery = useQuery({
		queryKey: ["user", "guild", guildId, "members", searchQuery],
		queryFn: () => APIHandler.searchGuildMembers(guildId, searchQuery || undefined),
		enabled: enabled && (searchQuery.length === 0 || searchQuery.length >= 2),
		retry: false,
	});
	const matchingMembers = membersQuery.data ?? [];
	const normalizedSearchInput = searchInput.trim();
	const dropdownOpen =
		enabled &&
		!disabled &&
		searchOpen &&
		normalizedSearchInput === searchQuery &&
		(normalizedSearchInput.length === 0 || normalizedSearchInput.length >= 2);
	const activeMember = dropdownOpen ? matchingMembers[activeMemberIndex] : undefined;
	const errorMessage =
		axios.isAxiosError<{ error?: string }>(membersQuery.error) &&
		typeof membersQuery.error.response?.data?.error === "string"
			? membersQuery.error.response.data.error
			: "Could not load guild members. Please try again.";

	const selectMember = (member: WarningMember) => {
		onSelect(member);
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
			setSearchOpen(true);
			setActiveMemberIndex((index) => (index <= 0 ? matchingMembers.length - 1 : index - 1));
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (activeMember) selectMember(activeMember);
		} else if (event.key === "Escape") {
			setSearchOpen(false);
			setActiveMemberIndex(-1);
		}
	};

	return (
		<>
			<div className="relative">
				<FiSearch
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					id={id}
					type="search"
					value={searchInput}
					onChange={(event) => {
						setSearchInput(event.target.value);
						setActiveMemberIndex(-1);
						setSearchOpen(true);
					}}
					disabled={!enabled || disabled}
					placeholder="Search guild members"
					autoComplete="off"
					role="combobox"
					aria-label="Search guild members"
					aria-expanded={dropdownOpen}
					aria-controls={listboxId}
					aria-autocomplete="list"
					aria-activedescendant={activeMember ? `${listboxId}-option-${activeMemberIndex}` : undefined}
					aria-describedby={`${id}-help`}
					className="w-full pl-10"
					onFocus={() => setSearchOpen(true)}
					onBlur={() => setSearchOpen(false)}
					onKeyDown={handleSearchKeyDown}
				/>
				{dropdownOpen && (
					<ul
						id={listboxId}
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
								{errorMessage}
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
								id={`${listboxId}-option-${index}`}
								role="option"
								aria-selected={member.id === selectedMemberId}
								onMouseDown={(event) => {
									event.preventDefault();
									selectMember(member);
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
			<p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
				Up to 100 members load when this tab opens. Search by username or nickname to find others.
			</p>
		</>
	);
}
