import { Button, Card, Dropdown, Tag } from "@febkosq8/arc";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { FiPlus } from "react-icons/fi";
import type { ReactNode } from "react";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import type { PlayerSuggestion } from "@jappan/handlers/APIHandler";

// How long to wait after typing before asking for suggestions, in milliseconds
const SUGGESTION_DEBOUNCE_MS = 400;
// Matches the longest query the API accepts
const MAX_QUERY_LENGTH = 200;
const kindLabels: Record<PlayerSuggestion["kind"], string> = {
	track: "Track",
	playlist: "Playlist",
	savedPlaylist: "Saved playlist",
};

export default function TrackInput({
	sessionId,
	disabled,
	adding,
	onAdd,
	loadSuggestions,
	title = "Add to queue",
	submitLabel = "Add",
	pendingLabel = "Adding…",
	submitIcon = <FiPlus className="mr-1" aria-hidden="true" />,
	inputLabel = "Track or playlist",
	inputPlaceholder = "Add a song, playlist, link or saved playlist",
	children,
}: {
	sessionId: string;
	disabled: boolean;
	adding: boolean;
	onAdd: (query: string) => void;
	loadSuggestions: (query: string) => Promise<PlayerSuggestion[]>;
	title?: string;
	submitLabel?: string;
	pendingLabel?: string;
	submitIcon?: ReactNode;
	inputLabel?: string;
	inputPlaceholder?: string;
	children?: ReactNode;
}) {
	const listboxId = useId();
	const [text, setText] = useState("");
	const [selectedSuggestion, setSelectedSuggestion] = useState<PlayerSuggestion | null>(null);
	const [debouncedText, setDebouncedText] = useState("");
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedText(text.trim()), SUGGESTION_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [text]);

	const suggestionsQuery = useQuery({
		queryKey: ["player-suggestions", sessionId, debouncedText],
		queryFn: () => loadSuggestions(debouncedText),
		enabled: open && !disabled,
		staleTime: 30_000,
		// The server rate-limits each connection, so a failed lookup is not repeated on its own
		retry: false,
		placeholderData: keepPreviousData,
	});
	const suggestions = open ? (suggestionsQuery.data ?? []) : [];
	const dropdownSuggestions =
		selectedSuggestion && !suggestions.some((suggestion) => suggestion.value === selectedSuggestion.value)
			? [...suggestions, selectedSuggestion]
			: suggestions;
	const suggestionItems = dropdownSuggestions.map((suggestion) => ({
		key: `${suggestion.kind}:${suggestion.value}`,
		label: suggestion.title,
	}));
	const suggestionsByKey = new Map<string, PlayerSuggestion>(
		dropdownSuggestions.map((suggestion) => [`${suggestion.kind}:${suggestion.value}`, suggestion] as const),
	);

	const submit = (query: string) => {
		const trimmed = query.trim();
		if (!trimmed || disabled) {
			return;
		}
		onAdd(trimmed);
		setText("");
		setSelectedSuggestion(null);
		setDebouncedText("");
		setOpen(false);
	};

	return (
		<Card hoverable={false} className="overflow-visible rounded-md border-border">
			<Card.Content className="p-4!">
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit(selectedSuggestion?.value ?? text);
					}}
				>
					<div className="flex items-center justify-between gap-3">
						<h2 className="min-w-0 text-lg font-semibold text-foreground">{title}</h2>
						<Button
							type="submit"
							size="sm"
							disabled={disabled || (text.trim() === "" && !selectedSuggestion)}
							className="shrink-0"
						>
							{submitIcon}
							{adding ? pendingLabel : submitLabel}
						</Button>
					</div>
					<div className={children ? "grid gap-4 md:grid-cols-2" : ""}>
						{children}
						<div>
							<div className="mb-1 flex h-5 items-center gap-2">
								<label
									htmlFor={`${listboxId}-input`}
									className="block text-sm font-medium text-foreground"
								>
									{inputLabel}
								</label>
								{suggestionsQuery.isFetching && (
									<LoadingIndicator
										label="Loading track suggestions"
										inline
										size={60}
										rows={1}
										columns={5}
									/>
								)}
							</div>
							<Dropdown
								id={`${listboxId}-input`}
								className="w-full"
								items={suggestionItems}
								value={selectedSuggestion ? `${selectedSuggestion.kind}:${selectedSuggestion.value}` : ""}
								inputValue={selectedSuggestion ? "" : text}
								onInputValueChange={(inputValue) => {
									const nextText = inputValue.slice(0, MAX_QUERY_LENGTH);
									setText(nextText);
									setSelectedSuggestion((current) =>
										current && (nextText === "" || current.title === nextText) ? current : null,
									);
								}}
								open={open}
								onOpenChange={setOpen}
								placeholder={selectedSuggestion ? "" : inputPlaceholder}
								disabled={disabled}
								loading={suggestionsQuery.isFetching}
								loadingLabel="Loading suggestions…"
								renderValue={(item) => suggestionsByKey.get(String(item.key))?.title ?? item.label}
								renderItem={(item) => {
									const suggestion = suggestionsByKey.get(String(item.key));
									if (!suggestion) {
										return item.label;
									}
									return (
										<>
											<span title={suggestion.title} className="min-w-0 flex-1 truncate">
												{suggestion.title}
											</span>
											<Tag
												variant={suggestion.kind === "savedPlaylist" ? "primary" : "secondary"}
												size="xs"
											>
												{kindLabels[suggestion.kind]}
											</Tag>
										</>
									);
								}}
								onChange={(item) => {
									const suggestion = item && suggestionsByKey.get(String(item.key));
									setText("");
									setSelectedSuggestion(suggestion ?? null);
									setOpen(false);
								}}
							/>
						</div>
					</div>
				</form>
			</Card.Content>
		</Card>
	);
}
