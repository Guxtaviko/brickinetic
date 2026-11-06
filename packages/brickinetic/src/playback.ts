export interface EffectPlaybackConfig {
	duration?: number
	direction?: 'forward' | 'reverse' | 'alternate'
	repeat?: boolean
	hold?: number
	paused?: boolean
	onProgress?: (progress: number) => void
}

export function validatePlayback(config: EffectPlaybackConfig) {
	if (!Number.isFinite(config.duration ?? 3) || (config.duration ?? 3) <= 0)
		throw new Error('playback.duration must be positive and finite')
	if (!Number.isFinite(config.hold ?? 0) || (config.hold ?? 0) < 0)
		throw new Error('playback.hold must be nonnegative and finite')
	if (
		config.direction !== undefined &&
		!['forward', 'reverse', 'alternate'].includes(config.direction)
	)
		throw new Error('playback.direction must be forward, reverse or alternate')
}

export function playbackPose(config: EffectPlaybackConfig, elapsed: number) {
	validatePlayback(config)
	const duration = config.duration ?? 3
	const hold = config.hold ?? 0
	const direction = config.direction ?? 'forward'
	const alternate = direction === 'alternate'
	const legSpan = duration + hold
	const total = alternate ? duration * 2 + hold : duration
	if (!config.repeat && elapsed >= total)
		return {
			progress: direction === 'forward' ? 1 : 0,
			moving: false,
			wait: 0,
			complete: true,
		}
	const time = config.repeat
		? elapsed % (legSpan * (alternate ? 2 : 1))
		: elapsed
	const backward = direction === 'reverse' || (alternate && time >= legSpan)
	const leg = alternate && time >= legSpan ? time - legSpan : time
	const progress = Math.max(0, Math.min(1, leg / duration))
	return {
		progress: backward ? 1 - progress : progress,
		moving: leg < duration,
		wait: leg < duration ? 0 : Math.max(0, legSpan - leg),
		complete: false,
	}
}
