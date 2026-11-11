import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Entry } from "@heatboard/core";
import { IconButton, RefusableButton, parseSeed, useAdmin } from "./admin";
import { MoreIcon } from "./icons";
import { cx, partProps, riderLabel, useBoardSettings } from "./settings";

/** Popover of a pool chip: edit the seed of the entry or remove it. Sits beside the draggable chip, never inside it. */
export function EntryMenu({ entry }: { entry: Entry }) {
	const settings = useBoardSettings();
	const name = riderLabel(settings, entry);
	const { allowed, refusal, run, labels } = useAdmin();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<string | null>(null);
	const [invalid, setInvalid] = useState(false);
	const rootRef = useRef<HTMLSpanElement>(null);
	const panelId = useId();

	const menu = partProps(settings, "entryPoolMenu", "hb-pool__menu");
	const input = partProps(settings, "input", "hb-input");
	const button = partProps(
		settings,
		"button",
		"hb-button",
		"hb-button--danger",
	);

	const seedReason = refusal({
		type: "updateEntry",
		riderId: entry.riderId,
		seed: entry.seed ?? null,
	});
	const removalReason = refusal({
		type: "removeEntry",
		riderId: entry.riderId,
	});

	/** False when the draft is not a valid seed and must stay open for correction. */
	const commitSeed = (): boolean => {
		if (draft === null) return true;
		const parsed = parseSeed(draft);
		if (parsed === undefined) {
			setInvalid(true);
			return false;
		}
		setDraft(null);
		if ((parsed ?? undefined) !== entry.seed) {
			run({ type: "updateEntry", riderId: entry.riderId, seed: parsed });
		}
		return true;
	};

	const outsidePress = useRef<(event: PointerEvent) => void>(() => undefined);
	useEffect(() => {
		outsidePress.current = (event) => {
			if (rootRef.current?.contains(event.target as Node)) return;
			if (commitSeed()) setOpen(false);
		};
	});
	useEffect(() => {
		if (!open) return;
		const listener = (event: PointerEvent) => outsidePress.current(event);
		document.addEventListener("pointerdown", listener, true);
		return () => document.removeEventListener("pointerdown", listener, true);
	}, [open]);

	if (!allowed("entries")) return null;

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			setDraft(null);
			setInvalid(false);
			setOpen(false);
			rootRef.current?.querySelector("button")?.focus();
		}
	};

	return (
		<span
			ref={rootRef}
			className={cx(!settings.unstyled && "hb-pool__menu-root")}
			onKeyDown={onKeyDown}
		>
			<IconButton
				label={labels.entryMenu(name)}
				aria={{
					"aria-expanded": open,
					"aria-controls": open ? panelId : undefined,
				}}
				onPress={() => setOpen((value) => !value)}
			>
				<MoreIcon />
			</IconButton>
			{open && (
				<div
					id={panelId}
					role="group"
					aria-label={labels.entryMenu(name)}
					className={menu.className}
					style={menu.style}
				>
					<input
						type="number"
						className={input.className}
						style={input.style}
						aria-label={labels.entrySeed(name)}
						aria-invalid={invalid || undefined}
						placeholder={labels.entrySeedField}
						min={1}
						step={1}
						disabled={seedReason !== undefined}
						title={seedReason}
						value={draft ?? entry.seed ?? ""}
						onChange={(e) => {
							setDraft(e.target.value);
							setInvalid(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitSeed();
							}
						}}
						onBlur={() => {
							commitSeed();
						}}
					/>
					{invalid && <span role="alert">{labels.invalidSeed}</span>}
					<RefusableButton
						className={button.className}
						style={button.style}
						ariaLabel={labels.removeEntry(name)}
						reason={removalReason}
						onPress={() => run({ type: "removeEntry", riderId: entry.riderId })}
					>
						{labels.remove}
					</RefusableButton>
				</div>
			)}
		</span>
	);
}
