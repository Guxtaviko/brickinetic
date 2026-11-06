import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateEasing, validateEasing } from '../src/easing.js'

test('CSS curves and smoothstep preserve exact endpoints and clamp overshoot', () => {
	for (const curve of [
		'linear',
		'smoothstep',
		'ease',
		'ease-in',
		'ease-out',
		'ease-in-out',
		[0.2, -3, 0.8, 4] as const,
	] as const) {
		assert.equal(evaluateEasing(curve, 0), 0)
		assert.equal(evaluateEasing(curve, 1), 1)
		for (let i = 0; i <= 100; i++) {
			const y = evaluateEasing(curve, i / 100)
			assert.ok(y >= 0 && y <= 1)
		}
	}
	assert.ok(Math.abs(evaluateEasing('ease', 0.5) - 0.802403) < 0.00001)
	assert.equal(evaluateEasing('smoothstep', 0.25), 0.15625)
	assert.ok(evaluateEasing('ease-in', 0.5) < 0.5)
	assert.ok(evaluateEasing('ease-out', 0.5) > 0.5)
	assert.ok(Math.abs(evaluateEasing('ease-in-out', 0.5) - 0.5) < 1e-8)
})

test('invalid easing names and tuple coordinates fail with field context', () => {
	for (const curve of [
		'unknown',
		[0, 0, 2, 1],
		[-1, 0, 1, 1],
		[0, NaN, 1, 1],
		[0, 0, 1],
	])
		assert.throws(() => validateEasing(curve), /easing/)
})
