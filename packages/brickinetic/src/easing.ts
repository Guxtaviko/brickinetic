export type BrickEffectEasing =
	| 'linear'
	| 'smoothstep'
	| 'ease'
	| 'ease-in'
	| 'ease-out'
	| 'ease-in-out'
	| readonly [number, number, number, number]

const curves = {
	ease: [0.25, 0.1, 0.25, 1],
	'ease-in': [0.42, 0, 1, 1],
	'ease-out': [0, 0, 0.58, 1],
	'ease-in-out': [0.42, 0, 0.58, 1],
} as const

export function validateEasing(
	value: unknown,
): asserts value is BrickEffectEasing {
	if (value === 'linear' || value === 'smoothstep') return
	if (typeof value === 'string' && Object.hasOwn(curves, value)) return
	if (
		Array.isArray(value) &&
		value.length === 4 &&
		value.every(Number.isFinite) &&
		value[0] >= 0 &&
		value[0] <= 1 &&
		value[2] >= 0 &&
		value[2] <= 1
	)
		return
	throw new Error(
		'easing must be a supported name or four finite cubic coordinates with X in [0, 1]',
	)
}

export function evaluateEasing(
	easing: BrickEffectEasing = 'linear',
	progress: number,
): number {
	validateEasing(easing)
	if (!Number.isFinite(progress)) throw new Error('progress must be finite')
	if (progress <= 0) return 0
	if (progress >= 1) return 1
	if (easing === 'linear') return progress
	if (easing === 'smoothstep') return progress * progress * (3 - 2 * progress)
	const [x1, y1, x2, y2] = typeof easing === 'string' ? curves[easing] : easing
	const sample = (t: number, a: number, b: number) =>
		3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3
	let low = 0
	let high = 1
	for (let i = 0; i < 48; i++) {
		const mid = (low + high) / 2
		if (sample(mid, x1, x2) < progress) low = mid
		else high = mid
	}
	return Math.max(0, Math.min(1, sample((low + high) / 2, y1, y2)))
}
