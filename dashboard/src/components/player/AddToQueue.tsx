import { Button, Card, Input, Tag } from "@febkosq8/arc";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { FiPlus } from "react-icons/fi";
import { type PlayerSuggestion } from "@jappan/handlers/APIHandler";

// How long to wait after typing before asking for suggestions, in milliseconds
const SUGGESTION_DEBOUNCE_MS = 400;
// Matches the longest query the API accepts
const MAX_QUERY_LENGTH = 200;
const kindLabels: Record<PlayerSuggestion["kind"], string> = {
	track: "Track",
	playlist: "Playlist",
	savedPlaylist: "Saved playlist",
};

export default function AddToQueue({
	sessionId,
	disabled,
	adding,
	onAdd,
	loadSuggestions,
}: {
	sessionId: string;
	disabled: boolean;
	adding: boolean;
	onAdd: (query: string) => void;
	loadSuggestions: (query: string) => Promise<PlayerSuggestion[]>;
}) {
	const listboxId = useId();
	const [text, setText] = useState("");
	const [debouncedText, setDebouncedText] = useState("");
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

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

	const submit = (query: string) => {
		const trimmed = query.trim();
		if (!trimmed || disabled) {
			return;
		}
		onAdd(trimmed);
		setText("");
		setDebouncedText("");
		setOpen(false);
		setActiveIndex(-1);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" && suggestions.length > 0) {
			event.preventDefault();
			setOpen(true);
			setActiveIndex((index) => (index + 1) % suggestions.length);
		} else if (event.key === "ArrowUp" && suggestions.length > 0) {
			event.preventDefault();
			setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
		} else if (event.key === "Escape") {
			setOpen(false);
			setActiveIndex(-1);
		}
	};

	const activeSuggestion = suggestions[activeIndex];
	return (
		<Card hoverable={false} className="overflow-visible rounded-md border-border">
			<Card.Content className="p-4!">
				<h2 className="mb-3 text-sm font-semibold text-muted-foreground">Add to queue</h2>
				<form
					className="relative flex flex-col gap-2 sm:flex-row sm:items-center"
					onSubmit={(event) => {
						event.preventDefault();
						submit(activeSuggestion?.value ?? text);
					}}
				>
					<label htmlFor={`${listboxId}-input`} className="sr-only">
						Add a song, playlist, link or saved playlist to the queue
					</label>
					<div className="relative min-w-0 flex-1">
						<Input
							id={`${listboxId}-input`}
							className="w-full"
							value={text}
							maxLength={MAX_QUERY_LENGTH}
							autoComplete="off"
							placeholder="Add a song, playlist, link or saved playlist"
							disabled={disabled}
							role="combobox"
							aria-expanded={open && suggestions.length > 0}
							aria-controls={listboxId}
							aria-autocomplete="list"
							aria-activedescendant={activeSuggestion ? `${listboxId}-option-${activeIndex}` : undefined}
							onChange={(event: ChangeEvent<HTMLInputElement>) => {
								setText(event.target.value);
								setActiveIndex(-1);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							onBlur={() => setOpen(false)}
							onKeyDown={handleKeyDown}
						/>
						{open && suggestions.length > 0 && (
							<ul
								id={listboxId}
								role="listbox"
								aria-label="Suggestions"
								className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
							>
								{suggestions.map((suggestion, index) => (
									<li
										key={`${suggestion.kind}-${suggestion.value}`}
										id={`${listboxId}-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										// mousedown keeps focus in the input so the list is not closed before the click registers
										onMouseDown={(event) => {
											event.preventDefault();
											submit(suggestion.value);
										}}
										onMouseEnter={() => setActiveIndex(index)}
										className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
											index === activeIndex ? "bg-muted" : ""
										}`}
									>
										<span className="min-w-0 truncate">{suggestion.title}</span>
										<Tag
											variant={suggestion.kind === "savedPlaylist" ? "primary" : "secondary"}
											size="xs"
										>
											{kindLabels[suggestion.kind]}
										</Tag>
									</li>
								))}
							</ul>
						)}
					</div>
					<Button type="submit" disabled={disabled || text.trim() === ""}>
						<FiPlus className="mr-1" aria-hidden="true" />
						{adding ? "Adding…" : "Add"}
					</Button>
				</form>
			</Card.Content>
		</Card>
	);
}
