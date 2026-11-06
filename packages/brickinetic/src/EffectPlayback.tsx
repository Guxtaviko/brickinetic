import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { type EffectPlaybackConfig, playbackPose } from './playback.js'

/** Owns only the effect clock; consumers retain ownership of frame presentation. */
export function EffectPlayback({
	config,
	permitted,
	assembled,
	apply,
}: {
	config: EffectPlaybackConfig
	permitted: boolean
	assembled: number
	apply: (progress: number) => void
}) {
	const invalidate = useThree((state) => state.invalidate)
	const frameloop = useThree((state) => state.frameloop)
	const elapsed = useRef(0)
	const initialized = useRef(false)
	const last = useRef(performance.now())
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const hidden = useRef(typeof document !== 'undefined' && document.hidden)
	const options = useRef({ config, permitted, assembled, apply })
	const clear = useCallback(() => {
		clearTimeout(timer.current)
		timer.current = undefined
	}, [])
	const tick = useCallback(
		(manualDelta?: number) => {
			clear()
			const current = options.current
			const now = performance.now()
			if (current.permitted && !current.config.paused && !hidden.current) {
				elapsed.current +=
					manualDelta ?? Math.max(0, (now - last.current) / 1000)
			}
			last.current = now
			const pose = playbackPose(current.config, elapsed.current)
			const progress = current.permitted ? pose.progress : current.assembled
			current.apply(progress)
			current.config.onProgress?.(progress)
			if (
				!current.permitted ||
				current.config.paused ||
				hidden.current ||
				pose.complete ||
				frameloop === 'never'
			)
				return
			if (pose.moving) {
				if (frameloop === 'demand') invalidate()
			} else if (pose.wait > 0 && frameloop === 'demand') {
				timer.current = setTimeout(
					() => {
						timer.current = undefined
						invalidate()
					},
					Math.min(2_147_483_647, pose.wait * 1000),
				)
			}
		},
		[clear, frameloop, invalidate],
	)
	useLayoutEffect(() => {
		// Account for an in-progress hold before a pause, then retain its remaining time.
		if (initialized.current && frameloop !== 'never') tick()
		initialized.current = true
		const wasPermitted = options.current.permitted
		options.current = { config, permitted, assembled, apply }
		if (!wasPermitted && permitted) elapsed.current = 0
		last.current = performance.now()
		tick(0)
		invalidate()
	}, [config, permitted, assembled, apply, tick, invalidate, frameloop])
	useEffect(() => {
		const visibility = () => {
			if (!hidden.current && frameloop !== 'never') tick()
			hidden.current = document.hidden
			last.current = performance.now()
			clear()
			if (!hidden.current) {
				tick(0)
				invalidate()
			}
		}
		document.addEventListener('visibilitychange', visibility)
		return () => {
			document.removeEventListener('visibilitychange', visibility)
			clear()
		}
	}, [clear, frameloop, invalidate, tick])
	useFrame((_, delta) => tick(frameloop === 'never' ? delta : undefined))
	return null
}
