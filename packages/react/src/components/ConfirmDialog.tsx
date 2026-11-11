import { useEffect, useId, useRef, type ReactNode } from "react";
import {
	applyAction,
	findHeat,
	simulateAdvancementChange,
	type Action,
	type Bracket,
	type Heat,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import type { Labels } from "../labels";
import { heatLabel } from "./heatLabel";
import { openPlacesAtStart } from "./slotRoutes";
import {
	partProps,
	riderLabel,
	useBoardSettings,
	type ConfirmDialogProps,
} from "./settings";

function placements(heats: Heat[]): number {
	return heats.reduce((total, heat) => total + heat.slots.length, 0);
}

/** What a removal or reset will take away, derived from the current bracket. */
function removalSummary(
	bracket: Bracket,
	action: Action,
	labels: Labels,
): string | undefined {
	if (action.type === "removeHeat") {
		const found = findHeat(bracket, action.heatId);
		if (!found) return undefined;
		const name = heatLabel(bracket, found.heat.id, labels);
		return labels.confirmRemoveHeat(name, found.heat.slots.length);
	}
	if (action.type === "removeRound") {
		const round = bracket.rounds.find((r) => r.id === action.roundId);
		if (!round) return undefined;
		return labels.confirmRemoveRound(
			round.name,
			round.heats.length,
			placements(round.heats),
		);
	}
	if (action.type === "setHeatStatus") {
		return labels.confirmStartOpenPlaces(openPlacesAtStart(bracket, action));
	}
	if (action.type === "applyFormat") return labels.confirmApplyFormat;
	if (action.type === "reset") {
		const result = applyAction(bracket, { ...action, confirm: true });
		if (!result.ok) return undefined;
		const keep = action.keepRounds ?? 1;
		let ranks = 0;
		let rounds = 0;
		bracket.rounds.forEach((round, roundIndex) => {
			const after = result.bracket.rounds[roundIndex];
			if (roundIndex >= keep && placements(round.heats) > 0) rounds++;
			for (const heat of round.heats) {
				const kept = after?.heats.find((h) => h.id === heat.id);
				for (const slot of heat.slots) {
					if (slot.rank === null) continue;
					const next = kept?.slots.find((s) => s.riderId === slot.riderId);
					if (next?.rank !== slot.rank) ranks++;
				}
			}
		});
		return labels.confirmReset(ranks, rounds);
	}
	return undefined;
}

function supportsModal(): boolean {
	return (
		typeof HTMLDialogElement !== "undefined" &&
		typeof HTMLDialogElement.prototype.showModal === "function"
	);
}

/**
 * Asks to confirm a destructive change and lists its impact. Uses a native
 * modal `<dialog>`; without `showModal` it renders inline as an `alertdialog`.
 */
export function ConfirmDialog({
	action,
	error,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { labels } = settings;
	const titleId = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const modal = supportsModal();

	const dialog = partProps(settings, "dialog", "hb-dialog");
	const title = partProps(settings, "dialogTitle", "hb-dialog__title");
	const impact = partProps(settings, "dialogImpact", "hb-dialog__impact");
	const actions = partProps(settings, "dialogActions", "hb-dialog__actions");
	const button = partProps(settings, "button", "hb-button");
	const danger = partProps(
		settings,
		"button",
		"hb-button",
		"hb-button--danger",
	);

	useEffect(() => {
		const element = dialogRef.current;
		if (modal) element?.showModal();
		else cancelRef.current?.focus();
		return () => {
			if (modal) element?.close();
		};
	}, [modal]);

	const judged =
		typeof error?.details?.judgedHeats === "number"
			? error.details.judgedHeats
			: undefined;
	const names = new Map(
		bracket.entries.map((e) => [e.riderId, riderLabel(settings, e)]),
	);
	const qualification =
		action.type === "updateRound" && action.advancing !== undefined
			? simulateAdvancementChange(bracket, {
					advancing: { roundId: action.roundId, value: action.advancing },
				}).qualification
			: [];

	const summary = removalSummary(bracket, action, labels);

	const body: ReactNode = (
		<>
			<h2 id={titleId} className={title.className} style={title.style}>
				{labels.confirmTitle[action.type] ?? labels.confirmTitleGeneric}
			</h2>
			<div className={impact.className} style={impact.style}>
				{error === undefined && <p>{labels.confirmSure}</p>}
				{summary !== undefined && <p>{summary}</p>}
				{judged !== undefined && <p>{labels.confirmImpact(judged)}</p>}
				{qualification.length > 0 && (
					<ul>
						{qualification.map((change) => {
							const rider = names.get(change.riderId) ?? change.riderId;
							return (
								<li key={`${change.heatId}-${change.riderId}`}>
									{change.qualifiedAfter
										? labels.qualificationGained(rider)
										: labels.qualificationLost(rider)}
								</li>
							);
						})}
					</ul>
				)}
			</div>
			<div className={actions.className} style={actions.style}>
				<button
					ref={cancelRef}
					type="button"
					className={button.className}
					style={button.style}
					autoFocus
					onClick={onCancel}
				>
					{labels.confirmCancel}
				</button>
				<button
					type="button"
					className={danger.className}
					style={danger.style}
					onClick={onConfirm}
				>
					{labels.confirmConfirm}
				</button>
			</div>
		</>
	);

	if (modal) {
		return (
			<dialog
				ref={dialogRef}
				className={dialog.className}
				style={dialog.style}
				role="alertdialog"
				aria-labelledby={titleId}
				onCancel={(event) => {
					event.preventDefault();
					onCancel();
				}}
			>
				{body}
			</dialog>
		);
	}
	return (
		<div
			className={dialog.className}
			style={dialog.style}
			role="alertdialog"
			aria-labelledby={titleId}
			data-inline="true"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					onCancel();
				}
			}}
		>
			{body}
		</div>
	);
}
