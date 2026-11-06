import assert from 'node:assert/strict'
import test from 'node:test'
import type { MotionConfig } from '../src/index.js'

const { advanceMotion, initialMotionState, motionPose, validateMotion } =
	await import('../src/motion.js')

test('validates motion numbers with field-specific errors', () => {
	validateMotion({
		float: { amplitude: 0, speed: -1 },
		spin: { axis: 'z', speed: 0 },
	})
	for (const [config, field] of [
		[{ float: { amplitude: -1 } }, 'motion.float.amplitude'],
		[{ float: { amplitude: Infinity } }, 'motion.float.amplitude'],
		[{ float: { speed: NaN } }, 'motion.float.speed'],
		[{ spin: { speed: Infinity } }, 'motion.spin.speed'],
	] as [MotionConfig, string][])
		assert.throws(
			() => validateMotion(config),
			new RegExp(field.replaceAll('.', '\\.')),
		)
})

test('evaluates defaults, axes, composition and elapsed time independently of frame rate', () => {
	for (const axis of ['x', 'y', 'z'] as const) {
		const config: MotionConfig = { float: {}, spin: { axis } }
		const poses = [30, 60, 144].map((rate) => {
			let state = initialMotionState()
			for (let i = 0; i < rate; i++)
				state = advanceMotion(state, config, 1 / rate)
			return motionPose(state, config)
		})
		for (const pose of poses) {
			assert.ok(Math.abs(pose.position[1] - 0.15 * Math.sin(0.8)) < 1e-6)
			assert.ok(
				Math.abs(
					pose.rotation[(['x', 'y', 'z'] as const).indexOf(axis)] - 0.1,
				) < 1e-6,
			)
		}
	}
})

test('retains, resets and reverses phases on updates', () => {
	let state = advanceMotion(
		initialMotionState(),
		{ float: { speed: -2 }, spin: { speed: 1 } },
		1,
	)
	state = advanceMotion(
		state,
		{ float: { speed: 0, amplitude: 2 }, spin: { speed: 2 } },
		0,
	)
	assert.equal(state.floatPhase, -2)
	assert.equal(
		motionPose(state, { float: { amplitude: 2 } }).position[1],
		2 * Math.sin(-2),
	)
	state = advanceMotion(state, { spin: { axis: 'x' } }, 0)
	assert.equal(state.spinPhase, 0)
	assert.equal(state.floatPhase, 0)
	state = advanceMotion(state, { float: {} }, 0, false)
	assert.equal(state.floatPhase, 0)
})

test('float follows each selected local axis and axis changes reset only its phase', () => {
	for (const [index, axis] of (['x', 'y', 'z'] as const).entries()) {
		const config: MotionConfig = {
			float: { axis, amplitude: 4, speed: 2 },
			spin: { axis: 'z', speed: 0.5 },
		}
		const state = advanceMotion(initialMotionState(), config, 0.25)
		const pose = motionPose(state, config)
		pose.position.forEach((value, i) => {
			assert.equal(value, i === index ? 4 * Math.sin(0.5) : 0)
		})
		assert.equal(pose.rotation[2], 0.125)
		const nextAxis = axis === 'x' ? 'y' : 'x'
		const next = advanceMotion(
			state,
			{ ...config, float: { ...config.float, axis: nextAxis } },
			0,
		)
		assert.equal(next.floatPhase, 0)
		assert.equal(next.spinPhase, state.spinPhase)
		assert.deepEqual(motionPose(next, config).position, [0, 0, 0])
	}
})

test('independent phases, zero speeds, enable transitions and preference gates restore identity', () => {
	const config: MotionConfig = {
		float: { axis: 'z', speed: -1 },
		spin: { axis: 'x', speed: -2 },
	}
	const first = advanceMotion(initialMotionState(), config, 2)
	const second = advanceMotion(initialMotionState(), config, 1)
	assert.notEqual(first.floatPhase, second.floatPhase)
	assert.notEqual(first.spinPhase, second.spinPhase)
	const held = advanceMotion(
		first,
		{ float: { axis: 'z', speed: 0 }, spin: { axis: 'x', speed: 0 } },
		10,
	)
	assert.equal(held.floatPhase, first.floatPhase)
	assert.equal(held.spinPhase, first.spinPhase)
	const stopped = advanceMotion(first, config, 0, false)
	assert.deepEqual(motionPose(stopped, config), {
		position: [0, 0, 0],
		rotation: [0, 0, 0],
	})
	const restarted = advanceMotion(stopped, config, 0)
	assert.equal(restarted.floatPhase, 0)
	assert.equal(restarted.spinPhase, 0)
	const onlySpin = advanceMotion(
		first,
		{ float: { enabled: false }, spin: config.spin },
		0,
	)
	assert.equal(onlySpin.floatPhase, 0)
	assert.equal(onlySpin.spinPhase, first.spinPhase)
})
