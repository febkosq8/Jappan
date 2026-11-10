import { Button, Input, LabelField } from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";

export const guildIdPattern = /^\d{17,20}$/u;

export default function GuildLookup({ guildId, onLookup }: { guildId: string; onLookup: (guildId: string) => void }) {
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
							<LabelField id="guild-id" label="Guild ID" className="mb-2" />
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
