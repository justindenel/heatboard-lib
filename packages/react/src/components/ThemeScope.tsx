import type { ReactNode } from "react";
import { useThemeProps } from "../theme";

/**
 * Carries the theme variables of the closest `HeatboardProvider` for lib editors (`ScoringEditor`,
 * `ViewerDisplayControl`, `FormatShape`...) that a host places outside of a `Board`, in a drawer or a dialog.
 */
export function ThemeScope(props: { children: ReactNode; className?: string }) {
	const themeProps = useThemeProps();
	return (
		<div className={props.className} {...themeProps}>
			{props.children}
		</div>
	);
}
