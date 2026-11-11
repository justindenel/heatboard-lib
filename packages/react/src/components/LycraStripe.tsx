import { partProps, useBoardSettings, type LycraStripeProps } from "./settings";

/** Colored bar identifying a rider on the water. */
export function LycraStripe({ color }: LycraStripeProps) {
	const settings = useBoardSettings();
	if (color === undefined) return null;
	const { className, style } = partProps(settings, "lycraStripe", "hb-lycra");
	return (
		<span
			className={className}
			style={{ backgroundColor: color, ...style }}
			data-color={color}
			role="img"
			aria-label={settings.labels.lycra(
				settings.labels.lycraColorNames[color.toLowerCase()] ?? color,
			)}
		/>
	);
}
