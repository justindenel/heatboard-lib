/** Heat index of the k-th rider when dealing across `n` heats back and forth. */
export function serpentineIndex(k: number, n: number): number {
	const r = k % (2 * n);
	return r < n ? r : 2 * n - 1 - r;
}
