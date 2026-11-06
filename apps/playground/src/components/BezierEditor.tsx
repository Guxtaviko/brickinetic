import {
	type BrickEffectEasing,
	evaluateEasing,
	validateEasing,
} from 'brickinetic'
import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react'

export type BezierCurve = Extract<BrickEffectEasing, readonly number[]>
export interface BezierEditorProps {
	value: BezierCurve
	onChange: (value: BezierCurve) => void
}
const presets: { name: string; curve: BezierCurve }[] = [
	{ name: 'Linear', curve: [0, 0, 1, 1] },
	{ name: 'Ease', curve: [0.25, 0.1, 0.25, 1] },
	{ name: 'Ease in', curve: [0.42, 0, 1, 1] },
	{ name: 'Ease out', curve: [0, 0, 0.58, 1] },
	{ name: 'Ease in out', curve: [0.42, 0, 0.58, 1] },
]
const clamp = (value: number, min = 0, max = 1) =>
	Math.max(min, Math.min(max, value))
const rounded = (value: number) => Number(value.toFixed(4))
const graphY = (value: number) => 200 - clamp(value, -0.2, 1.2) * 160

/** Controlled curve authoring; invalid drafts never replace the parent's valid value. */
export function BezierEditor({ value, onChange }: BezierEditorProps) {
	validateEasing(value)
	const id = useId()
	const [drafts, setDrafts] = useState(() => value.map(String))
	const [error, setError] = useState('')
	const [copyStatus, setCopyStatus] = useState('')
	const [progress, setProgress] = useState(0.5)
	const emitted = useRef('')
	const drag = useRef<
		| {
				index: 0 | 2
				pointer: number
				x: number
				y: number
				point: readonly [number, number]
		  }
		| undefined
	>(undefined)
	useEffect(() => {
		if (JSON.stringify(value) !== emitted.current) {
			setDrafts(value.map(String))
			setError('')
		}
	}, [value])
	const commit = (next: BezierCurve, normalize = true) => {
		validateEasing(next)
		emitted.current = JSON.stringify(next)
		if (normalize) setDrafts(next.map(String))
		setError('')
		setCopyStatus('')
		onChange(next)
	}
	const edit = (index: number, text: string) => {
		const next = drafts.map((draft, i) => (i === index ? text : draft))
		setDrafts(next)
		try {
			if (next.some((draft) => draft.trim() === ''))
				throw new Error('Empty coordinate')
			const tuple = [
				Number(next[0]),
				Number(next[1]),
				Number(next[2]),
				Number(next[3]),
			] as const
			validateEasing(tuple)
			commit(tuple, false)
		} catch {
			setError(
				'Enter four finite numbers. X coordinates must be between 0 and 1.',
			)
		}
	}
	const point = (index: 0 | 2, x: number, y: number) => {
		const next: [number, number, number, number] = [...value]
		next[index] = rounded(clamp(x))
		next[index + 1] = rounded(y)
		commit(next)
	}
	const keyboard = (index: 0 | 2, event: KeyboardEvent<SVGCircleElement>) => {
		const step = event.shiftKey ? 0.1 : 0.01
		let x = value[index]
		let y = value[index + 1]
		switch (event.key) {
			case 'ArrowLeft':
				x -= step
				break
			case 'ArrowRight':
				x += step
				break
			case 'ArrowUp':
				y += step
				break
			case 'ArrowDown':
				y -= step
				break
			case 'Home':
				x = 0
				break
			case 'End':
				x = 1
				break
			default:
				return
		}
		event.preventDefault()
		point(index, x, y)
	}
	const pointerDown = (index: 0 | 2, event: PointerEvent<SVGCircleElement>) => {
		if (drag.current || event.button !== 0) return
		event.preventDefault()
		event.currentTarget.focus()
		event.currentTarget.setPointerCapture(event.pointerId)
		drag.current = {
			index,
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			point: [value[index], value[index + 1]],
		}
	}
	const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const current = drag.current
		if (!current || current.pointer !== event.pointerId) return
		const bounds = event.currentTarget.getBoundingClientRect()
		if (!bounds.width || !bounds.height) return
		point(
			current.index,
			current.point[0] +
				((event.clientX - current.x) * 320) / bounds.width / 240,
			current.point[1] -
				((event.clientY - current.y) * 240) / bounds.height / 160,
		)
	}
	const path = Array.from({ length: 81 }, (_, i) => {
		const x = i / 80
		return `${i === 0 ? 'M' : 'L'} ${40 + x * 240} ${200 - evaluateEasing(value, x) * 160}`
	}).join(' ')
	const preview = evaluateEasing(value, progress)
	const tuple = `[${value.join(', ')}]`
	return (
		<fieldset className='min-w-0 space-y-4 border-0 p-0'>
			<legend className='sr-only'>Cubic Bézier editor</legend>
			<svg
				viewBox='0 0 320 240'
				aria-label='Cubic Bézier graph'
				aria-describedby={`${id}-help`}
				className='block w-full touch-none rounded-lg border bg-fd-card'
				onPointerMove={pointerMove}
				onPointerUp={() => {
					drag.current = undefined
				}}
				onPointerCancel={() => {
					drag.current = undefined
				}}
			>
				<title>Construction curve</title>
				<path
					d='M40 40V200H280 M40 120H280 M160 40V200'
					fill='none'
					className='stroke-fd-border'
				/>
				<path
					d='M40 200L280 40'
					fill='none'
					strokeDasharray='4 5'
					className='stroke-fd-muted-foreground/40'
				/>
				<path
					d={`M40 200L${40 + value[0] * 240} ${graphY(value[1])} M280 40L${40 + value[2] * 240} ${graphY(value[3])}`}
					fill='none'
					className='stroke-fd-muted-foreground'
				/>
				<path
					d={path}
					fill='none'
					strokeWidth={3}
					className='stroke-fd-primary'
				/>
				{([0, 2] as const).map((index) => (
					<circle
						key={index}
						role='slider'
						tabIndex={0}
						aria-label={
							index === 0 ? 'First control point' : 'Second control point'
						}
						aria-valuemin={0}
						aria-valuemax={1}
						aria-valuenow={value[index]}
						aria-valuetext={`X ${value[index]}, Y ${value[index + 1]}`}
						aria-describedby={`${id}-help`}
						cx={40 + value[index] * 240}
						cy={graphY(value[index + 1])}
						r={10}
						strokeWidth={2}
						className='cursor-grab fill-fd-background stroke-fd-primary focus-visible:stroke-fd-foreground active:cursor-grabbing'
						onKeyDown={(event) => keyboard(index, event)}
						onPointerDown={(event) => pointerDown(index, event)}
						onLostPointerCapture={() => {
							drag.current = undefined
						}}
					/>
				))}
				<text x={40} y={224} fontSize={12} className='fill-fd-muted-foreground'>
					0
				</text>
				<text
					x={274}
					y={224}
					fontSize={12}
					className='fill-fd-muted-foreground'
				>
					1
				</text>
			</svg>
			<p
				id={`${id}-help`}
				className='text-xs leading-relaxed text-fd-muted-foreground'
			>
				Drag the handles or use arrow keys. Shift changes by 0.1. Y may
				overshoot; the construction curve and preview stay bounded.
			</p>
			<div className='grid grid-cols-4 gap-2'>
				{['X1', 'Y1', 'X2', 'Y2'].map((label, index) => (
					<label key={label} className='min-w-0 text-xs font-medium'>
						{label}
						<input
							aria-label={label}
							type='text'
							inputMode='decimal'
							value={drafts[index]}
							aria-invalid={!!error}
							aria-describedby={error ? `${id}-error` : undefined}
							className='mt-1 w-full min-w-0 rounded-md border bg-fd-background px-2 py-2 font-mono text-sm'
							onChange={(event) => edit(index, event.currentTarget.value)}
							onBlur={() => {
								if (!error) setDrafts(value.map(String))
							}}
						/>
					</label>
				))}
			</div>
			{error && (
				<p
					id={`${id}-error`}
					role='alert'
					className='text-sm text-fd-foreground'
				>
					{error}
				</p>
			)}
			<div className='flex flex-wrap gap-1.5'>
				{presets.map((preset) => (
					<button
						type='button'
						key={preset.name}
						className='rounded-md border px-2.5 py-1.5 text-xs hover:bg-fd-accent'
						onClick={() => commit(preset.curve)}
					>
						{preset.name}
					</button>
				))}
			</div>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<code className='select-text text-xs'>{tuple}</code>
				<button
					type='button'
					className='rounded-md border px-3 py-2 text-xs font-medium hover:bg-fd-accent'
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(tuple)
							setCopyStatus('Copied tuple.')
						} catch {
							setCopyStatus('Copy failed. Select the tuple to copy it.')
						}
					}}
				>
					Copy tuple
				</button>
			</div>
			<p
				role='status'
				aria-label='Copy status'
				className='min-h-4 text-xs text-fd-muted-foreground'
			>
				{copyStatus}
			</p>
			<label className='block text-xs font-medium'>
				Preview progress
				<input
					aria-label='Preview progress'
					className='mt-2 block w-full accent-fd-primary'
					type='range'
					min={0}
					max={1}
					step={0.01}
					value={progress}
					onChange={(event) => setProgress(event.currentTarget.valueAsNumber)}
				/>
			</label>
			<div
				className='relative h-3 overflow-hidden rounded-full bg-fd-secondary'
				aria-hidden='true'
			>
				<span
					className='absolute top-0.5 size-2 rounded-full bg-fd-primary'
					style={{ left: `calc(${preview * 100}% - ${preview * 8}px)` }}
				/>
			</div>
			<p className='text-xs text-fd-muted-foreground'>
				Construction value{' '}
				<output className='font-mono' data-testid='preview-value'>
					{preview.toFixed(3)}
				</output>
			</p>
		</fieldset>
	)
}
