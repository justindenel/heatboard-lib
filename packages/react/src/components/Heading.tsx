import { createElement, type HTMLAttributes } from "react";
import { headingTag, useBoardSettings } from "./settings";

/** Heading placed `depth` levels below the board title. */
export function Heading({
	depth,
	...rest
}: { depth: number } & HTMLAttributes<HTMLHeadingElement>) {
	const { headingLevel } = useBoardSettings();
	return createElement(headingTag(headingLevel, depth), rest);
}
