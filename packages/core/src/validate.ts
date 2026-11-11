import type { BracketError } from "./errors";
import { editorStateProblem } from "./format/editor";
import { parseFormat } from "./format/parse";
import { entryRoundIndex, findEntry } from "./internal/bracket";
import { rideMeansProblem } from "./internal/judging";
import { raceProblem } from "./internal/race";
import { makeError } from "./internal/result";
import type { Bracket, Heat } from "./model";
import type { BracketOptions } from "./options";
import { isIsoDate } from "./internal/time";
import { findHeat } from "./queries";
import { scoringProblem } from "./scoring/validate";

function rankProblem(heat: Heat): string | undefined {
	const ranks: number[] = [];
	for (const slot of heat.slots) {
		if (slot.rank === null) continue;
		if (slot.status !== undefined) {
			return `rider "${slot.riderId}" has a rank and a status`;
		}
		ranks.push(slot.rank);
	}
	const sorted = [...ranks].sort((a, b) => a - b);
	const contiguous = sorted.every((rank, i) => rank === i + 1);
	return contiguous
		? undefined
		: `ranks [${sorted.join(", ")}] are not 1..${sorted.length}`;
}

function orderProblem(heat: Heat): string | undefined {
	if (heat.order === undefined) return undefined;
	if (heat.status !== "running")
		return "order is only allowed on a running heat";
	if (heat.slots.some((s) => s.rank !== null)) {
		return "order cannot coexist with ranks";
	}
	const seen = new Set<string>();
	for (const id of heat.order) {
		const slot = heat.slots.find((s) => s.riderId === id);
		if (!slot || slot.status !== undefined) {
			return `order lists rider "${id}" who is not an unstatused rider of the heat`;
		}
		if (seen.has(id)) return `order lists rider "${id}" twice`;
		seen.add(id);
	}
	return undefined;
}

/** Returns every structural problem found in the bracket; `[]` means valid. */
export function validateBracket(
	bracket: Bracket,
	// Reserved: no option affects validation yet.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_options?: BracketOptions,
): BracketError[] {
	const errors: BracketError[] = [];

	const duplicateIds = (kind: string, ids: string[]) => {
		const seen = new Set<string>();
		for (const id of ids) {
			if (seen.has(id)) {
				errors.push(
					makeError("DUPLICATE_ID", `Duplicate ${kind} id "${id}"`, { id }),
				);
			}
			seen.add(id);
		}
	};
	duplicateIds(
		"round",
		bracket.rounds.map((r) => r.id),
	);
	duplicateIds(
		"heat",
		bracket.rounds.flatMap((r) => r.heats.map((h) => h.id)),
	);
	duplicateIds(
		"entry",
		bracket.entries.map((e) => e.riderId),
	);

	for (const entry of bracket.entries) {
		if (entryRoundIndex(bracket, entry) === -1) {
			errors.push(
				makeError(
					"UNKNOWN_ROUND",
					`Rider "${entry.riderId}" has unknown entry round "${entry.entryRoundId ?? ""}"`,
					{ riderId: entry.riderId, roundId: entry.entryRoundId ?? "" },
				),
			);
		}
	}

	if (bracket.scoring) {
		const problem = scoringProblem(bracket.scoring);
		if (problem) {
			errors.push(
				makeError("INVALID_SCORING", problem.message, {
					field: problem.field,
				}),
			);
		}
	}

	const raceIssue = bracket.timing && raceProblem(bracket.timing);
	if (raceIssue) {
		errors.push(makeError("INVALID_ARGUMENT", raceIssue, { field: "timing" }));
	}

	const chainBreak = bracket.chain?.break;
	if (
		chainBreak !== undefined &&
		(!isIsoDate(chainBreak.startedAt) ||
			!Number.isInteger(chainBreak.durationSec) ||
			chainBreak.durationSec < 0)
	) {
		errors.push(
			makeError("INVALID_ARGUMENT", "The chain break is malformed", {
				field: "chain",
			}),
		);
	}

	if (bracket.format !== undefined) {
		const parsed = parseFormat(bracket.format.settings);
		if (!parsed.ok) {
			errors.push(
				makeError(
					"INVALID_FORMAT",
					`Stored format is invalid at "${parsed.errors[0]?.path ?? ""}": ${parsed.errors[0]?.message ?? ""}`,
					{ path: parsed.errors[0]?.path ?? "" },
				),
			);
		}
		if (!Number.isInteger(bracket.format.drawSeed)) {
			errors.push(
				makeError(
					"INVALID_FORMAT",
					`Stored format draw seed must be an integer, got ${bracket.format.drawSeed}`,
					{ path: "drawSeed" },
				),
			);
		}
		const editorProblem =
			bracket.format.editor === undefined
				? undefined
				: editorStateProblem(bracket.format.editor);
		if (editorProblem) {
			errors.push(
				makeError("INVALID_FORMAT", editorProblem, {
					path: "editor",
				}),
			);
		}
	}

	const unsupported = rideMeansProblem(bracket);
	if (unsupported) {
		errors.push(
			makeError("INVALID_SCORING", unsupported.message, {
				field: "method",
			}),
		);
	}

	for (const [roundIndex, round] of bracket.rounds.entries()) {
		const seen = new Set<string>();
		for (const heat of round.heats) {
			if (
				heat.status === "pending" &&
				(heat.timing !== undefined || heat.judgingMode !== undefined)
			) {
				errors.push(
					makeError(
						"INVALID_ARGUMENT",
						`Heat "${heat.id}": a race format snapshot is only allowed on a heat that has started`,
						{ heatId: heat.id },
					),
				);
			}
			if (heat.startedAt !== undefined) {
				const problem = !isIsoDate(heat.startedAt)
					? `startedAt "${heat.startedAt}" is not an ISO date`
					: heat.status === "pending"
						? "startedAt is only allowed on a heat that has started"
						: undefined;
				if (problem) {
					errors.push(
						makeError("INVALID_ARGUMENT", `Heat "${heat.id}": ${problem}`, {
							heatId: heat.id,
						}),
					);
				}
			}
			if (heat.endedAt !== undefined) {
				const problem = !isIsoDate(heat.endedAt)
					? `endedAt "${heat.endedAt}" is not an ISO date`
					: heat.startedAt === undefined
						? "endedAt is only allowed on a heat that has started"
						: undefined;
				if (problem) {
					errors.push(
						makeError("INVALID_ARGUMENT", `Heat "${heat.id}": ${problem}`, {
							heatId: heat.id,
						}),
					);
				}
			}
			if (heat.scoring !== undefined) {
				const scoringIssue =
					heat.status === "pending"
						? "a scoring snapshot is only allowed on a heat that has started"
						: scoringProblem(heat.scoring)?.message;
				if (scoringIssue) {
					errors.push(
						makeError("INVALID_SCORING", `Heat "${heat.id}": ${scoringIssue}`, {
							field: "scoring",
							heatId: heat.id,
						}),
					);
				}
			}
			if (heat.penalties !== undefined) {
				const riderIds = new Set(heat.slots.map((s) => s.riderId));
				const penaltyProblem =
					heat.status === "pending"
						? "penalties are only allowed on a heat that has started"
						: heat.penalties
								.map((p) =>
									riderIds.has(p.riderId)
										? undefined
										: `penalty for rider "${p.riderId}" who is not in the heat`,
								)
								.find((m) => m !== undefined);
				if (penaltyProblem) {
					errors.push(
						makeError(
							"INVALID_PENALTY",
							`Heat "${heat.id}": ${penaltyProblem}`,
							{ heatId: heat.id },
						),
					);
				}
			}
			if (heat.slots.length > round.maxPerHeat) {
				errors.push(
					makeError(
						"HEAT_FULL",
						`Heat "${heat.id}" holds ${heat.slots.length} riders, above the maximum of ${round.maxPerHeat}`,
						{
							heatId: heat.id,
							max: round.maxPerHeat,
							current: heat.slots.length,
						},
					),
				);
			}
			const problem = rankProblem(heat) ?? orderProblem(heat);
			if (problem) {
				errors.push(
					makeError("INVALID_RANKS", `Heat "${heat.id}": ${problem}`, {
						heatId: heat.id,
					}),
				);
			}
			for (const slot of heat.slots) {
				const { riderId } = slot;
				if (seen.has(riderId)) {
					errors.push(
						makeError(
							"RIDER_ALREADY_IN_ROUND",
							`Rider "${riderId}" appears more than once in round "${round.id}"`,
							{ riderId, roundId: round.id },
						),
					);
				}
				seen.add(riderId);
				const entry = findEntry(bracket, riderId);
				if (!entry) {
					errors.push(
						makeError(
							"UNKNOWN_RIDER",
							`Rider "${riderId}" in heat "${heat.id}" is not in entries`,
							{ riderId, heatId: heat.id },
						),
					);
				} else if (roundIndex < entryRoundIndex(bracket, entry)) {
					errors.push(
						makeError(
							"BEFORE_ENTRY_ROUND",
							`Rider "${riderId}" is placed in round "${round.id}" before entering at round "${entry.entryRoundId ?? ""}"`,
							{ riderId, roundId: round.id },
						),
					);
				}
			}
		}
	}

	for (const link of bracket.links) {
		const from = findHeat(bracket, link.from.heatId);
		if (!from) {
			errors.push(
				makeError(
					"UNKNOWN_HEAT",
					`Link from unknown heat "${link.from.heatId}"`,
					{ heatId: link.from.heatId },
				),
			);
		}
		if (!Number.isInteger(link.from.rank) || link.from.rank < 1) {
			errors.push(
				makeError(
					"INVALID_LINK",
					`Link from heat "${link.from.heatId}" has invalid rank ${link.from.rank}`,
					{ heatId: link.from.heatId, rank: link.from.rank },
				),
			);
		}
		if (link.to === "eliminated") continue;
		const to = findHeat(bracket, link.to.heatId);
		if (!to) {
			errors.push(
				makeError("UNKNOWN_HEAT", `Link to unknown heat "${link.to.heatId}"`, {
					heatId: link.to.heatId,
				}),
			);
		} else if (from && to.roundIndex <= from.roundIndex) {
			errors.push(
				makeError(
					"INVALID_LINK",
					`Link from heat "${link.from.heatId}" targets heat "${link.to.heatId}" which is not in a later round`,
					{ fromHeatId: link.from.heatId, toHeatId: link.to.heatId },
				),
			);
		}
	}

	return errors;
}
