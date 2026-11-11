import { useState, type FormEvent } from "react";
import type { Action, Entry } from "@heatboard/core";
import { RefusableButton, parseSeed, useAdmin } from "./admin";
import { partProps, useBoardSettings, type EntryFormProps } from "./settings";

/** Registers a new entry with a display name and an optional seed. */
export function EntryForm({ entryRoundId }: EntryFormProps) {
	const settings = useBoardSettings();
	const { allowed, refusal, run, labels } = useAdmin();
	const [name, setName] = useState("");
	const [seed, setSeed] = useState("");
	const [invalidSeed, setInvalidSeed] = useState(false);
	const form = partProps(settings, "entryForm", "hb-entry-form");
	const input = partProps(settings, "input", "hb-input");
	const button = partProps(settings, "button", "hb-button");
	if (!allowed("entries")) return null;

	const probe: Action = {
		type: "addEntry",
		entry: {
			riderId: "",
			displayName: "",
			...(entryRoundId !== undefined && { entryRoundId }),
		},
	};
	const reason = refusal(probe);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const displayName = name.trim();
		if (displayName === "") return;
		const parsed = parseSeed(seed);
		if (parsed === undefined) {
			setInvalidSeed(true);
			return;
		}
		const entry: Entry = { riderId: settings.createId(), displayName };
		if (parsed !== null) entry.seed = parsed;
		if (entryRoundId !== undefined) entry.entryRoundId = entryRoundId;
		if (run({ type: "addEntry", entry }).ok) {
			setName("");
			setSeed("");
		}
	};

	return (
		<form
			className={form.className}
			style={form.style}
			onSubmit={submit}
			noValidate
		>
			<input
				type="text"
				className={input.className}
				style={input.style}
				aria-label={labels.entryNameField}
				placeholder={labels.entryNameField}
				required
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<input
				type="number"
				className={input.className}
				style={input.style}
				aria-label={labels.entrySeedField}
				placeholder={labels.entrySeedField}
				min={1}
				step={1}
				value={seed}
				aria-invalid={invalidSeed || undefined}
				onChange={(e) => {
					setSeed(e.target.value);
					setInvalidSeed(false);
				}}
			/>
			{invalidSeed && <span role="alert">{labels.invalidSeed}</span>}
			<RefusableButton
				type="submit"
				className={button.className}
				style={button.style}
				reason={reason}
			>
				{labels.addEntry}
			</RefusableButton>
		</form>
	);
}
