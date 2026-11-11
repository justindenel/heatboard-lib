import { useId, type ReactNode } from "react";

export interface SegmentOption<T extends string> {
	value: T;
	label: string;
}

export function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly SegmentOption<T>[];
	onChange: (value: T) => void;
}) {
	const labelId = useId();
	return (
		<div className="pg-group">
			<span className="pg-group__label" id={labelId}>
				{label}
			</span>
			<div className="pg-seg" role="group" aria-labelledby={labelId}>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className="pg-seg__btn"
						aria-pressed={option.value === value}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

export function PlaygroundHeader({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<header className="pg-header">
			<h1 className="pg-header__title">{title}</h1>
			<div className="pg-header__groups">{children}</div>
		</header>
	);
}
