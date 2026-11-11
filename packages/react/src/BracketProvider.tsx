import type { ReactNode } from "react";
import { BracketContext } from "./context";
import {
	SettingsContext,
	usePresentation,
	type PresentationProps,
} from "./components/settings";
import type { BracketController } from "./useBracket";

export interface BracketProviderProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	value: BracketController;
	children: ReactNode;
}

/**
 * Provides the bracket controller to the components below it, with their default display settings:
 * a `Board` or a component can still override them with its own props.
 */
export function BracketProvider<TRider = unknown>({
	value,
	children,
	...presentation
}: BracketProviderProps<TRider>) {
	const settings = usePresentation(presentation);
	return (
		<BracketContext.Provider value={value}>
			<SettingsContext.Provider value={settings}>
				{children}
			</SettingsContext.Provider>
		</BracketContext.Provider>
	);
}
