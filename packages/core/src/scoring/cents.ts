export function toCents(value: number): number {
	return Math.round(value * 100);
}

export function fromCents(cents: number): number {
	return cents / 100;
}
