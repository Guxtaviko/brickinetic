import type { BrickEffectEasing } from 'brickinetic'
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'
import { useTheme } from 'fumadocs-ui/provider/base'
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { type BezierCurve, BezierEditor } from './components/BezierEditor'
import {
	AxisSelect,
	ControlGroup,
	NumberField,
	Slider,
	Toggle,
} from './components/Controls'
import { ModelViewport } from './components/ModelViewport'
import {
	createModelConfig,
	defaultSettings,
	formatModelCode,
	models,
	type PlaygroundSettings,
} from './playground-config'

export interface AppProps {
	compact?: boolean
}
const customDefault: BezierCurve = [0.25, 0.1, 0.25, 1]
const easingNames = [
	'linear',
	'smoothstep',
	'ease',
	'ease-in',
	'ease-out',
	'ease-in-out',
] as const

export default function App({ compact = false }: AppProps) {
	const [settings, setSettings] = useState<PlaygroundSettings>(() => ({
		...defaultSettings,
	}))
	const [xyzPreview, setXyzPreview] = useState(true)
	const [replay, setReplay] = useState(0)
	const [copied, setCopied] = useState('')
	const actualProgress = useRef(0)
	const progressOutput = useRef<HTMLOutputElement>(null)
	const { resolvedTheme } = useTheme()
	const [background, setBackground] = useState(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue('--viewer-background')
			.trim(),
	)
	useEffect(() => {
		setBackground(
			getComputedStyle(document.documentElement)
				.getPropertyValue('--viewer-background')
				.trim(),
		)
	}, [resolvedTheme])
	const update = useCallback(function update<
		K extends keyof PlaygroundSettings,
	>(key: K, value: PlaygroundSettings[K]) {
		setSettings((previous) => ({ ...previous, [key]: value }))
	}, [])
	const reportProgress = useCallback((progress: number) => {
		actualProgress.current = progress
		if (progressOutput.current)
			progressOutput.current.textContent = `${Math.round(progress * 100)}%`
	}, [])
	const config = useMemo(() => createModelConfig(settings), [settings])
	const code = useMemo(() => formatModelCode(config), [config])
	const deferredCode = useDeferredValue(code)
	const changeMode = (mode: PlaygroundSettings['mode']) => {
		setSettings((previous) => ({
			...previous,
			mode,
			paused: false,
			progress: mode === 'manual' ? actualProgress.current : previous.progress,
		}))
	}
	const replayEffect = () => {
		update('paused', false)
		setReplay((value) => value + 1)
	}
	const customCurve =
		typeof settings.easing === 'string' ? customDefault : settings.easing
	const modelControl = (
		<label className='control-field'>
			Model
			<select
				className='control-input'
				aria-label='Model'
				value={settings.modelId}
				onChange={(event) => update('modelId', event.currentTarget.value)}
			>
				{models.map((model) => (
					<option key={model.id} value={model.id}>
						{model.label}
					</option>
				))}
			</select>
		</label>
	)
	const effectControl = (
		<label className='control-field'>
			Effect
			<select
				className='control-input'
				aria-label='Construction effect'
				value={settings.effectType}
				onChange={(event) =>
					update(
						'effectType',
						event.currentTarget.value as PlaygroundSettings['effectType'],
					)
				}
			>
				<option value='assembly'>Assembly</option>
				<option value='explosion'>Explosion</option>
				<option value='none'>None</option>
			</select>
		</label>
	)
	const playbackButtons = settings.effectType !== 'none' && (
		<div className='flex flex-wrap items-center gap-2'>
			<button
				className='ui-button'
				type='button'
				onClick={() => update('paused', !settings.paused)}
			>
				{settings.paused ? 'Resume effect' : 'Pause effect'}
			</button>
			<button className='ui-button' type='button' onClick={replayEffect}>
				Replay
			</button>
			<output
				aria-label='Current effect progress'
				aria-live='off'
				ref={progressOutput}
				className='ml-auto w-12 text-right font-mono text-xs tabular-nums'
			>
				0%
			</output>
		</div>
	)
	const viewport = (
		<ModelViewport
			config={config}
			xyzPreview={xyzPreview}
			onAxesChange={setXyzPreview}
			replay={replay}
			background={background}
			onProgress={reportProgress}
			compact={compact}
		/>
	)
	if (compact)
		return (
			<div className='space-y-4'>
				<div className='grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]'>
					<div className='min-w-0'>{modelControl}</div>
					<div className='min-w-0'>{effectControl}</div>
					<div className='col-span-2 sm:col-span-1'>
						<Toggle
							label='Spin'
							checked={settings.spinEnabled}
							onChange={(value) => update('spinEnabled', value)}
						/>
					</div>
				</div>
				{viewport}
				{playbackButtons}
			</div>
		)
	return (
		<div className='mx-auto w-full max-w-7xl px-5 py-8 sm:px-8'>
			<div className='mb-7'>
				<h1 className='text-3xl font-semibold tracking-tight'>Playground</h1>
				<p className='mt-2 text-sm text-fd-muted-foreground'>
					Shape an effect, then use it in your scene.
				</p>
			</div>
			<div className='grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_21rem]'>
				<div className='min-w-0 self-start lg:sticky lg:top-20'>{viewport}</div>
				<aside
					aria-label='Model controls'
					className='controls-scroll min-w-0 space-y-6 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-3'
				>
					<ControlGroup title='Model'>
						{modelControl}
						{effectControl}
					</ControlGroup>
					{settings.effectType !== 'none' && (
						<>
							<ControlGroup title='Playback'>
								<fieldset className='m-0 border-0 p-0'>
									<legend className='sr-only'>Playback mode</legend>
									<div className='grid grid-cols-2 gap-1 rounded-lg bg-fd-secondary p-1'>
										{(['automatic', 'manual'] as const).map((mode) => (
											<label
												key={mode}
												className='flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-sm has-checked:bg-fd-background has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-fd-ring'
											>
												<input
													type='radio'
													name='playback-mode'
													value={mode}
													checked={settings.mode === mode}
													onChange={() => changeMode(mode)}
													className='size-3.5 accent-fd-primary'
												/>
												<span>
													{mode === 'automatic' ? 'Automatic' : 'Manual'}
												</span>
											</label>
										))}
									</div>
								</fieldset>
								{settings.mode === 'manual' ? (
									<Slider
										label='Effect progress'
										min={0}
										max={1}
										step={0.001}
										value={settings.progress}
										onChange={(value) => {
											actualProgress.current = value
											update('progress', value)
										}}
									/>
								) : (
									<>
										<div className='grid grid-cols-2 gap-3'>
											<NumberField
												label='Duration (seconds)'
												min={0.1}
												value={settings.duration}
												onChange={(value) => update('duration', value)}
											/>
											<NumberField
												label='Hold (seconds)'
												min={0}
												value={settings.hold}
												onChange={(value) => update('hold', value)}
											/>
										</div>
										<label className='control-field'>
											Direction
											<select
												className='control-input'
												aria-label='Playback direction'
												value={settings.direction}
												onChange={(event) =>
													update(
														'direction',
														event.currentTarget
															.value as PlaygroundSettings['direction'],
													)
												}
											>
												<option value='forward'>Forward</option>
												<option value='reverse'>Reverse</option>
												<option value='alternate'>Alternate</option>
											</select>
										</label>
										<Toggle
											label='Repeat'
											checked={settings.repeat}
											onChange={(value) => update('repeat', value)}
										/>
										{playbackButtons}
									</>
								)}
							</ControlGroup>
							<ControlGroup
								title={
									settings.effectType === 'assembly'
										? 'Assembly shape'
										: 'Explosion shape'
								}
							>
								{settings.effectType === 'assembly' ? (
									<>
										<div className='grid grid-cols-2 gap-3'>
											<AxisSelect
												label='Assembly axis'
												value={settings.assemblyAxis}
												onChange={(value) => update('assemblyAxis', value)}
											/>
											<label className='control-field'>
												Order
												<select
													className='control-input'
													aria-label='Assembly order'
													value={settings.assemblyDirection}
													onChange={(event) =>
														update(
															'assemblyDirection',
															event.currentTarget
																.value as PlaygroundSettings['assemblyDirection'],
														)
													}
												>
													<option value='ascending'>Ascending</option>
													<option value='descending'>Descending</option>
												</select>
											</label>
										</div>
										<label className='control-field'>
											Entrance
											<select
												className='control-input'
												aria-label='Assembly entrance'
												value={settings.entrance}
												onChange={(event) =>
													update(
														'entrance',
														event.currentTarget
															.value as PlaygroundSettings['entrance'],
													)
												}
											>
												<option value='instant'>Instant</option>
												<option value='translate'>Translate</option>
											</select>
										</label>
										{settings.entrance === 'translate' && (
											<NumberField
												label='Entrance offset Y (LU)'
												value={settings.offsetY}
												onChange={(value) => update('offsetY', value)}
											/>
										)}
									</>
								) : (
									<>
										<Toggle
											label='Use distance units'
											checked={!settings.relativeDistance}
											onChange={(value) => update('relativeDistance', !value)}
										/>
										{settings.relativeDistance ? (
											<NumberField
												label='Distance multiplier'
												min={0}
												value={settings.distanceMultiplier}
												onChange={(value) =>
													update('distanceMultiplier', value)
												}
											/>
										) : (
											<NumberField
												label='Explosion distance'
												min={0}
												value={settings.distance}
												onChange={(value) => update('distance', value)}
											/>
										)}
										<NumberField
											label='Explosion rotation (degrees)'
											min={0}
											step={1}
											value={settings.explosionRotation}
											onChange={(value) => update('explosionRotation', value)}
										/>
									</>
								)}
								<label className='control-field'>
									Easing
									<select
										className='control-input'
										aria-label='Easing'
										value={
											typeof settings.easing === 'string'
												? settings.easing
												: 'custom'
										}
										onChange={(event) =>
											update(
												'easing',
												event.currentTarget.value === 'custom'
													? customCurve
													: (event.currentTarget.value as BrickEffectEasing),
											)
										}
									>
										{easingNames.map((name) => (
											<option key={name} value={name}>
												{name}
											</option>
										))}
										<option value='custom'>Custom Bézier</option>
									</select>
								</label>
								{typeof settings.easing !== 'string' && (
									<BezierEditor
										value={settings.easing}
										onChange={(value) => update('easing', value)}
									/>
								)}
								<Slider
									label='Randomness'
									min={0}
									max={1}
									step={0.01}
									value={settings.randomness}
									onChange={(value) => update('randomness', value)}
								/>
								<NumberField
									label='Seed'
									min={0}
									max={4294967295}
									step={1}
									integer
									value={settings.seed}
									onChange={(value) => update('seed', value)}
								/>
							</ControlGroup>
						</>
					)}
					<ControlGroup title='Appearance'>
						<Toggle
							label='Center bounds'
							checked={settings.center}
							onChange={(value) => update('center', value)}
						/>
						<Toggle
							label='Edge lines'
							checked={settings.edges}
							onChange={(value) => update('edges', value)}
						/>
						<label className='control-field'>
							Reduced motion
							<select
								className='control-input'
								aria-label='Reduced motion'
								value={settings.reducedMotion}
								onChange={(event) =>
									update(
										'reducedMotion',
										event.currentTarget
											.value as PlaygroundSettings['reducedMotion'],
									)
								}
							>
								<option value='system'>Follow system</option>
								<option value='always'>Always reduce</option>
								<option value='never'>Allow motion</option>
							</select>
						</label>
					</ControlGroup>
					<ControlGroup title='Motion'>
						<Toggle
							label='Spin'
							checked={settings.spinEnabled}
							onChange={(value) => update('spinEnabled', value)}
						/>
						{settings.spinEnabled && (
							<div className='grid grid-cols-2 gap-3'>
								<AxisSelect
									label='Spin axis'
									value={settings.spinAxis}
									onChange={(value) => update('spinAxis', value)}
								/>
								<NumberField
									label='Spin speed (rad/s)'
									value={settings.spinSpeed}
									onChange={(value) => update('spinSpeed', value)}
								/>
							</div>
						)}
						<Toggle
							label='Float'
							checked={settings.floatEnabled}
							onChange={(value) => update('floatEnabled', value)}
						/>
						{settings.floatEnabled && (
							<>
								<AxisSelect
									label='Float axis'
									value={settings.floatAxis}
									onChange={(value) => update('floatAxis', value)}
								/>
								<div className='grid grid-cols-2 gap-3'>
									<NumberField
										label='Float amplitude'
										min={0}
										value={settings.amplitude}
										onChange={(value) => update('amplitude', value)}
									/>
									<NumberField
										label='Float speed (rad/s)'
										value={settings.floatSpeed}
										onChange={(value) => update('floatSpeed', value)}
									/>
								</div>
							</>
						)}
					</ControlGroup>
					<ControlGroup title='Model transform'>
						<Slider
							label='Position X'
							min={-80}
							max={80}
							unit=' LU'
							value={settings.positionX}
							onChange={(value) => update('positionX', value)}
						/>
						<Slider
							label='Rotation Y'
							min={-180}
							max={180}
							unit='°'
							value={settings.rotationY}
							onChange={(value) => update('rotationY', value)}
						/>
						<Slider
							label='Uniform scale'
							min={0.5}
							max={2}
							step={0.05}
							unit='×'
							value={settings.scale}
							onChange={(value) => update('scale', value)}
						/>
					</ControlGroup>
				</aside>
			</div>
			<section
				aria-label='Generated React code'
				className='mt-10 min-w-0 border-t pt-7'
			>
				<div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
					<div>
						<h2 className='text-xl font-semibold tracking-tight'>React code</h2>
						<p className='mt-1 text-sm text-fd-muted-foreground'>
							The same configuration as the viewport.{' '}
							<a
								className='underline underline-offset-4'
								href='/docs/controllers'
							>
								Drive it with a controller
							</a>
							.
						</p>
					</div>
					<button
						type='button'
						className='ui-button'
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(code)
								setCopied('Copied code.')
							} catch {
								setCopied('Copy failed. Select the code to copy it.')
							}
						}}
					>
						Copy code
					</button>
				</div>
				<p
					role='status'
					aria-label='Code copy status'
					className='mb-2 min-h-4 text-xs text-fd-muted-foreground'
				>
					{copied}
				</p>
				<div data-testid='generated-code' aria-busy={code !== deferredCode}>
					<DynamicCodeBlock
						lang='tsx'
						code={deferredCode}
						codeblock={{ allowCopy: false }}
					/>
				</div>
			</section>
		</div>
	)
}
