export interface FloatMotion {
	axis?: 'x' | 'y' | 'z'
	enabled?: boolean
	amplitude?: number
	speed?: number
}

export interface SpinMotion {
	enabled?: boolean
	axis?: 'x' | 'y' | 'z'
	speed?: number
}

export interface MotionConfig {
	float?: false | FloatMotion
	spin?: false | SpinMotion
	reducedMotion?: 'system' | 'never'
}

export function validateMotion(motion: MotionConfig | undefined): void {
	const float = motion?.float
	const spin = motion?.spin
	if (
		float &&
		float.amplitude !== undefined &&
		(!Number.isFinite(float.amplitude) || float.amplitude < 0)
	) {
		throw new Error('motion.float.amplitude must be finite and nonnegative')
	}
	if (float && float.speed !== undefined && !Number.isFinite(float.speed)) {
		throw new Error('motion.float.speed must be finite')
	}
	if (spin && spin.speed !== undefined && !Number.isFinite(spin.speed)) {
		throw new Error('motion.spin.speed must be finite')
	}
}

export interface MotionState {
	floatAxis: 'x' | 'y' | 'z'
	floatPhase: number
	spinPhase: number
	floatActive: boolean
	spinActive: boolean
	axis: 'x' | 'y' | 'z'
}

export function initialMotionState(): MotionState {
	return {
		floatAxis: 'y',
		floatPhase: 0,
		spinPhase: 0,
		floatActive: false,
		spinActive: false,
		axis: 'y',
	}
}

export function advanceMotion(
	previous: MotionState,
	config: MotionConfig | undefined,
	delta: number,
	permitted = true,
): MotionState {
	validateMotion(config)
	const float = config?.float || undefined
	const spin = config?.spin || undefined
	const floatActive = permitted && !!float && float.enabled !== false
	const spinActive = permitted && !!spin && spin.enabled !== false
	const axis = spin?.axis ?? 'y'
	const floatAxis = float?.axis ?? 'y'
	return {
		floatActive,
		spinActive,
		axis,
		floatAxis,
		floatPhase: floatActive
			? (previous.floatActive && previous.floatAxis === floatAxis
					? previous.floatPhase
					: 0) +
				delta * (float?.speed ?? 0.8)
			: 0,
		spinPhase: spinActive
			? (previous.spinActive && previous.axis === axis
					? previous.spinPhase
					: 0) +
				delta * (spin?.speed ?? 0.2)
			: 0,
	}
}

export function motionPose(
	state: MotionState,
	config: MotionConfig | undefined,
) {
	const float = config?.float || undefined
	const rotation: [number, number, number] = [0, 0, 0]
	if (state.spinActive)
		rotation[{ x: 0, y: 1, z: 2 }[state.axis]] = state.spinPhase
	const position: [number, number, number] = [0, 0, 0]
	if (state.floatActive)
		position[{ x: 0, y: 1, z: 2 }[state.floatAxis]] =
			(float?.amplitude ?? 0.15) * Math.sin(state.floatPhase)
	return { position, rotation }
}
