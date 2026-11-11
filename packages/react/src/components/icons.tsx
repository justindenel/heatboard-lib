import type { ReactNode } from "react";

function Svg(props: { children: ReactNode; filled?: boolean }) {
	return (
		<svg
			width={20}
			height={20}
			viewBox="0 0 24 24"
			fill={props.filled ? "currentColor" : "none"}
			stroke={props.filled ? "none" : "currentColor"}
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{props.children}
		</svg>
	);
}

export function PlayIcon() {
	return (
		<Svg filled>
			<path d="M8 5v14l11-7z" />
		</Svg>
	);
}

export function PlusIcon() {
	return (
		<Svg>
			<path d="M12 5v14M5 12h14" />
		</Svg>
	);
}

export function MoreIcon() {
	return (
		<Svg filled>
			<circle cx="5" cy="12" r="1.75" />
			<circle cx="12" cy="12" r="1.75" />
			<circle cx="19" cy="12" r="1.75" />
		</Svg>
	);
}

export function CloseIcon() {
	return (
		<Svg>
			<path d="M6 6l12 12M18 6L6 18" />
		</Svg>
	);
}

export function ChevronIcon({ up }: { up: boolean }) {
	return (
		<Svg>
			<path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
		</Svg>
	);
}

export function UsersIcon() {
	return (
		<Svg>
			<circle cx="9" cy="8" r="3.5" />
			<path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7" />
		</Svg>
	);
}

export function GripIcon() {
	return (
		<Svg filled>
			<circle cx="9" cy="6" r="1.6" />
			<circle cx="15" cy="6" r="1.6" />
			<circle cx="9" cy="12" r="1.6" />
			<circle cx="15" cy="12" r="1.6" />
			<circle cx="9" cy="18" r="1.6" />
			<circle cx="15" cy="18" r="1.6" />
		</Svg>
	);
}

export function TrashIcon() {
	return (
		<Svg>
			<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
		</Svg>
	);
}

export function ChevronRightIcon() {
	return (
		<Svg>
			<path d="M9 6l6 6-6 6" />
		</Svg>
	);
}

export function ArrowLeftIcon() {
	return (
		<Svg>
			<path d="M19 12H5M11 6l-6 6 6 6" />
		</Svg>
	);
}

export function SearchIcon() {
	return (
		<Svg>
			<circle cx="11" cy="11" r="6.5" />
			<path d="M16 16l4.5 4.5" />
		</Svg>
	);
}

export function CheckIcon() {
	return (
		<Svg>
			<path d="M5 12.5l4.5 4.5L19 7" />
		</Svg>
	);
}
