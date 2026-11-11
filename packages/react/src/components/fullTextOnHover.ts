import type { MouseEvent } from "react";

/**
 * Mouse handler for a single-line ellipsized element: while its text is cut, the native tooltip
 * shows it in full, followed by `extra` (the tooltip the element would otherwise carry). The
 * text itself is untouched, so the accessible name stays complete.
 */
export function fullTextOnHover(extra?: string) {
	return {
		onMouseEnter(event: MouseEvent<HTMLElement>) {
			const el = event.currentTarget;
			const cut = el.scrollWidth > el.clientWidth;
			const title = cut
				? [el.textContent, extra].filter(Boolean).join(" — ")
				: extra;
			if (title) el.setAttribute("title", title);
			else el.removeAttribute("title");
		},
	};
}
