const ISO_DATE =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Strict ISO 8601 date-time with a zone; `Date.parse` alone accepts overflowing days such as February 31st. */
export function isIsoDate(value: string): boolean {
	const match = ISO_DATE.exec(value);
	if (!match || !Number.isFinite(Date.parse(value))) return false;
	const [year, month, day, hour, minute, second] = match
		.slice(1, 7)
		.map(Number) as [number, number, number, number, number, number];
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return (
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= daysInMonth &&
		hour < 24 &&
		minute < 60 &&
		second < 60
	);
}
