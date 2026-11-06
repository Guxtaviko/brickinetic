import assert from 'node:assert/strict'
import test from 'node:test'
import { playbackPose, validatePlayback } from '../src/playback.js'

test('forward reverse and alternate complete at exact endpoints', () => {
	assert.equal(playbackPose({}, 0).progress, 0)
	assert.equal(playbackPose({}, 1.5).progress, 0.5)
	assert.deepEqual(playbackPose({}, 3), {
		progress: 1,
		moving: false,
		wait: 0,
		complete: true,
	})
	assert.equal(playbackPose({ direction: 'reverse' }, 0).progress, 1)
	assert.equal(playbackPose({ direction: 'reverse' }, 3).progress, 0)
	assert.equal(playbackPose({ direction: 'alternate' }, 3).progress, 1)
	assert.equal(playbackPose({ direction: 'alternate' }, 4.5).progress, 0.5)
	assert.equal(playbackPose({ direction: 'alternate' }, 6).progress, 0)
	assert.equal(playbackPose({ direction: 'alternate' }, 6).complete, true)
})

test('repeated legs hold at destinations and alternate holds both endpoints', () => {
	const forward = { duration: 2, hold: 1, repeat: true }
	assert.equal(playbackPose(forward, 2).progress, 1)
	assert.equal(playbackPose(forward, 2.25).wait, 0.75)
	assert.equal(playbackPose(forward, 3).progress, 0)
	assert.equal(playbackPose(forward, 4).progress, 0.5)
	const alternate = { ...forward, direction: 'alternate' as const }
	assert.equal(playbackPose(alternate, 2.5).progress, 1)
	assert.equal(playbackPose(alternate, 4).progress, 0.5)
	assert.equal(playbackPose(alternate, 5.5).progress, 0)
	assert.equal(playbackPose(alternate, 6).progress, 0)
})

test('validates playback durations holds and directions', () => {
	for (const duration of [0, -1, NaN, Infinity])
		assert.throws(() => validatePlayback({ duration }), /duration/)
	for (const hold of [-1, NaN, Infinity])
		assert.throws(() => validatePlayback({ hold }), /hold/)
	assert.throws(
		() =>
			Reflect.apply(validatePlayback, undefined, [{ direction: 'sideways' }]),
		/direction/,
	)
})
