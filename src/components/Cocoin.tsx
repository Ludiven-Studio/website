/* The cocoin — the game currency: a gold coin struck with a cocotte's head.
   Inline SVG on purpose: it sits at 16 px next to a number in a dozen places, so it has
   to stay crisp, cost no request, and never flash in after the text. Decorative by
   default (aria-hidden) — the surrounding label carries the meaning. */

export default function Cocoin({ size = '1em', className }: { size?: number | string; className?: string }) {
	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox="0 0 32 32"
			aria-hidden="true"
			focusable="false"
			style={{ verticalAlign: '-0.14em', flex: 'none' }}
		>
			<circle cx="16" cy="16" r="15.5" fill="#c9820d" />
			<circle cx="16" cy="16" r="12.6" fill="#ffc93f" />
			<g transform="translate(16 16) scale(1.12) translate(-16 -16)">
				<g fill="#8a5406">
					<circle cx="9.5" cy="11.25" r="2.38" />
					<circle cx="13" cy="9.88" r="2.38" />
					<circle cx="16.38" cy="11.13" r="2.38" />
					<ellipse cx="13.5" cy="17.25" rx="7" ry="6.5" />
					<path d="M19.5 15.5 25.4 17.6 19.5 20Z" />
					<circle cx="16.5" cy="22.88" r="2.13" />
				</g>
				<circle cx="16" cy="15.75" r="1.5" fill="#ffc93f" />
			</g>
		</svg>
	);
}
