import { useState } from "react";
import type { Action } from "@heatboard/core";
import { useBracketContext } from "../context";
import { useAdmin } from "./admin";
import {
	partProps,
	useBoardSettings,
	type RoundControlsProps,
} from "./settings";

const MAX_PER_HEAT_CHOICES = 10;

function range(from: number, to: number, keep?: number): number[] {
	const values = Array.from(
		{ length: Math.max(0, to - from + 1) },
		(_, i) => from + i,
	);
	return keep !== undefined && !values.includes(keep)
		? [...values, keep].sort((a, b) => a - b)
		: values;
}

/** Minutes as typed to seconds; `null` for an empty field, `undefined` when invalid. */
function parseMinutes(text: string): number | null | undefined {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const minutes = Number(trimmed.replace(",", "."));
	return Number.isFinite(minutes) && minutes > 0
		? Math.round(minutes * 60)
		: undefined;
}

export function DurationField(props: {
	label: string;
	seconds: number | undefined;
	onCommit: (seconds: number | null) => void;
}) {
	const settings = useBoardSettings();
	const input = partProps(settings, "input", "hb-input");
	const shown = props.seconds === undefined ? "" : String(props.seconds / 60);
	const [draft, setDraft] = useState(shown);
	const [seen, setSeen] = useState(shown);
	if (seen !== shown) {
		setSeen(shown);
		setDraft(shown);
	}
	const commit = () => {
		const parsed = parseMinutes(draft);
		if (parsed === undefined) {
			setDraft(shown);
		} else if ((parsed ?? undefined) !== props.seconds) {
			props.onCommit(parsed);
		}
	};
	return (
		<input
			className={input.className}
			style={input.style}
			type="number"
			min={1}
			step="any"
			aria-label={props.label}
			title={props.label}
			placeholder="min"
			size={4}
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
			}}
		/>
	);
}

/**
 * Heat size and qualified count of a round when the bracket has no stored format
 * (otherwise the format owns them). Confirmation of destructive changes only exists inside a `Board`.
 */
export function RoundControls({ round }: RoundControlsProps) {
	const settings = useBoardSettings();
	const { bracket } = useBracketContext();
	const { allowed, refusal, run, labels } = useAdmin();
	const root = partProps(settings, "controls", "hb-controls");
	const select = partProps(settings, "select", "hb-select");
	const note = partProps(settings, "controlsNote", "hb-controls__note");
	const fromFormat = bracket.format !== undefined;

	if (!allowed("roundSettings")) return null;

	const maxAction = (max: number): Action => ({
		type: "setMaxPerHeat",
		roundId: round.id,
		max,
	});
	const advancingAction = (advancing: number): Action => ({
		type: "updateRound",
		roundId: round.id,
		advancing,
	});

	return (
		<div
			className={root.className}
			style={root.style}
			role="group"
			aria-label={round.name}
		>
			{fromFormat ? (
				<p className={note.className} style={note.style}>
					{labels.setByFormat}
				</p>
			) : (
				<>
					<select
						className={select.className}
						style={select.style}
						aria-label={labels.maxPerHeatField}
						value={round.maxPerHeat}
						onChange={(e) => run(maxAction(Number(e.target.value)))}
					>
						{range(1, MAX_PER_HEAT_CHOICES, round.maxPerHeat).map((n) => {
							const reason = refusal(maxAction(n));
							return (
								<option
									key={n}
									value={n}
									disabled={reason !== undefined}
									title={reason}
								>
									{labels.maxPerHeat(n)}
								</option>
							);
						})}
					</select>
					{round.advancing > 0 && (
						<select
							className={select.className}
							style={select.style}
							aria-label={labels.advancingField}
							value={round.advancing}
							onChange={(e) => run(advancingAction(Number(e.target.value)))}
						>
							{range(1, round.maxPerHeat, round.advancing).map((n) => (
								<option key={n} value={n}>
									{labels.advancing(n)}
								</option>
							))}
						</select>
					)}
				</>
			)}
		</div>
	);
}
