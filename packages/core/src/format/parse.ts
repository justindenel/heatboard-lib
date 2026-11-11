import type {
	FormatIssue,
	FormatOutcome,
	FormatPlacement,
	FormatRound,
	FormatSettings,
	ParseFormatResult,
} from "./model";

export const MAX_FORMAT_ROUNDS = 97;
export const MAX_FORMAT_HEATS = 64;
const MAX_RANK = 100;
const MAX_SEED_SLOTS = 1000;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRank(value: unknown): value is number {
	return (
		Number.isInteger(value) &&
		(value as number) >= 1 &&
		(value as number) <= MAX_RANK
	);
}

function checkKeys(
	value: Json,
	allowed: string[],
	path: string,
	issues: FormatIssue[],
) {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			issues.push({
				path: path ? `${path}.${key}` : key,
				message: `Unknown field "${key}"`,
			});
		}
	}
}

function parseOutcomes(
	value: unknown,
	path: string,
	laterKeys: Set<string>,
	issues: FormatIssue[],
): FormatOutcome[] | undefined {
	if (!Array.isArray(value)) {
		issues.push({ path, message: "Must be an array" });
		return undefined;
	}
	const outcomes: FormatOutcome[] = [];
	const taken = new Set<number>();
	value.forEach((raw, i) => {
		const at = `${path}[${i}]`;
		if (!isObject(raw)) {
			issues.push({ path: at, message: "Must be an object" });
			return;
		}
		checkKeys(raw, ["ranks", "to"], at, issues);
		let ranks: [number, number] | undefined;
		const r = raw.ranks;
		if (!Array.isArray(r) || r.length !== 2 || !isRank(r[0]) || !isRank(r[1])) {
			issues.push({
				path: `${at}.ranks`,
				message: `Must be [from, to] with integers between 1 and ${MAX_RANK}`,
			});
		} else if (r[0] > r[1]) {
			issues.push({
				path: `${at}.ranks`,
				message: "The first rank must not exceed the second",
			});
		} else {
			ranks = [r[0], r[1]];
			const overlap = [...Array(r[1] - r[0] + 1).keys()]
				.map((d) => (r[0] as number) + d)
				.find((rank) => taken.has(rank));
			if (overlap !== undefined) {
				issues.push({
					path: `${at}.ranks`,
					message: `Rank ${overlap} is already used by another outcome`,
				});
				ranks = undefined;
			} else {
				for (let rank = r[0]; rank <= r[1]; rank++) taken.add(rank);
			}
		}
		const to = checkTarget(raw.to, `${at}.to`, laterKeys, issues);
		if (ranks && to !== undefined) outcomes.push({ ranks, to });
	});
	return outcomes;
}

function checkTarget(
	value: unknown,
	path: string,
	laterKeys: Set<string>,
	issues: FormatIssue[],
): string | undefined {
	if (typeof value !== "string" || !laterKeys.has(value)) {
		issues.push({ path, message: "Must be the key of a later round" });
		return undefined;
	}
	return value;
}

function parseRound(
	raw: unknown,
	index: number,
	laterKeys: Set<string>,
	seenKeys: Set<string>,
	issues: FormatIssue[],
): FormatRound | undefined {
	const path = `rounds[${index}]`;
	if (!isObject(raw)) {
		issues.push({ path, message: "Must be an object" });
		return undefined;
	}
	const before = issues.length;
	checkKeys(
		raw,
		[
			"key",
			"name",
			"group",
			"heats",
			"outcomes",
			"optional",
			"placement",
			"seedSlots",
		],
		path,
		issues,
	);

	const key = raw.key;
	if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
		issues.push({
			path: `${path}.key`,
			message: "Must match ^[a-z0-9][a-z0-9-]{0,30}$",
		});
	} else if (seenKeys.has(key)) {
		issues.push({ path: `${path}.key`, message: `Duplicate key "${key}"` });
	}
	if (typeof raw.name !== "string" || raw.name.trim() === "") {
		issues.push({
			path: `${path}.name`,
			message: "Must be a non-empty string",
		});
	}
	if (
		raw.group !== undefined &&
		(typeof raw.group !== "string" || !KEY_PATTERN.test(raw.group))
	) {
		issues.push({
			path: `${path}.group`,
			message: "Must match ^[a-z0-9][a-z0-9-]{0,30}$",
		});
	}
	const heats = raw.heats;
	if (
		!Number.isInteger(heats) ||
		(heats as number) < 1 ||
		(heats as number) > MAX_FORMAT_HEATS
	) {
		issues.push({
			path: `${path}.heats`,
			message: `Must be an integer between 1 and ${MAX_FORMAT_HEATS}`,
		});
	}
	if (raw.optional !== undefined && typeof raw.optional !== "boolean") {
		issues.push({ path: `${path}.optional`, message: "Must be a boolean" });
	}
	if (
		raw.placement !== undefined &&
		raw.placement !== "branch" &&
		raw.placement !== "spread"
	) {
		issues.push({
			path: `${path}.placement`,
			message: 'Must be "branch" or "spread"',
		});
	}

	if (raw.seedSlots !== undefined) {
		if (
			!Number.isInteger(raw.seedSlots) ||
			(raw.seedSlots as number) < 0 ||
			(raw.seedSlots as number) > MAX_SEED_SLOTS
		) {
			issues.push({
				path: `${path}.seedSlots`,
				message: `Must be an integer between 0 and ${MAX_SEED_SLOTS}`,
			});
		} else if (
			(raw.seedSlots as number) > 0 &&
			(index === 0 || (raw.group ?? "main") !== "main" || raw.optional === true)
		) {
			issues.push({
				path: `${path}.seedSlots`,
				message: "Only a main round other than the first can receive seeds",
			});
		}
	}

	const outcomes =
		raw.outcomes === undefined
			? undefined
			: parseOutcomes(raw.outcomes, `${path}.outcomes`, laterKeys, issues);

	if (issues.length > before) return undefined;
	const round: FormatRound = {
		key: key as string,
		name: raw.name as string,
		heats: heats as number,
	};
	if (raw.group !== undefined) round.group = raw.group as string;
	if (outcomes && outcomes.length > 0) round.outcomes = outcomes;
	if (raw.optional !== undefined) round.optional = raw.optional as boolean;
	if (raw.placement !== undefined) {
		round.placement = raw.placement as FormatPlacement;
	}
	if (raw.seedSlots !== undefined) round.seedSlots = raw.seedSlots as number;
	return round;
}

/** Validates untrusted JSON (a string or an already parsed value) into format settings. */
export function parseFormat(input: unknown): ParseFormatResult {
	let json = input;
	if (typeof input === "string") {
		try {
			json = JSON.parse(input);
		} catch (error) {
			return {
				ok: false,
				errors: [
					{ path: "", message: `Invalid JSON: ${(error as Error).message}` },
				],
			};
		}
	}
	if (!isObject(json)) {
		return { ok: false, errors: [{ path: "", message: "Must be an object" }] };
	}
	const issues: FormatIssue[] = [];
	checkKeys(
		json,
		["heatboardFormat", "name", "description", "fill", "rounds"],
		"",
		issues,
	);
	if (json.heatboardFormat !== 1) {
		issues.push({ path: "heatboardFormat", message: "Must be 1" });
	}
	if (typeof json.name !== "string" || json.name.trim() === "") {
		issues.push({ path: "name", message: "Must be a non-empty string" });
	}
	if (json.description !== undefined && typeof json.description !== "string") {
		issues.push({ path: "description", message: "Must be a string" });
	}
	if (json.fill !== "serpentine" && json.fill !== "draw") {
		issues.push({ path: "fill", message: 'Must be "serpentine" or "draw"' });
	}

	const rounds: FormatRound[] = [];
	if (!Array.isArray(json.rounds) || json.rounds.length === 0) {
		issues.push({ path: "rounds", message: "Must be a non-empty array" });
	} else if (json.rounds.length > MAX_FORMAT_ROUNDS) {
		issues.push({
			path: "rounds",
			message: `At most ${MAX_FORMAT_ROUNDS} rounds`,
		});
	} else {
		const rawRounds: unknown[] = json.rounds;
		const seen = new Set<string>();
		rawRounds.forEach((raw, i) => {
			const later = new Set(
				rawRounds
					.slice(i + 1)
					.map((r) => (isObject(r) ? r.key : undefined))
					.filter((k): k is string => typeof k === "string"),
			);
			const round = parseRound(raw, i, later, seen, issues);
			if (round) rounds.push(round);
			if (isObject(raw) && typeof raw.key === "string") seen.add(raw.key);
		});
	}
	if (issues.length > 0) return { ok: false, errors: issues };

	const format: FormatSettings = {
		heatboardFormat: 1,
		name: json.name as string,
		fill: json.fill as FormatSettings["fill"],
		rounds,
	};
	if (json.description !== undefined)
		format.description = json.description as string;
	return { ok: true, format };
}
