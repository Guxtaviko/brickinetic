import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { Axis } from '../playground-config'

export function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string
	checked: boolean
	onChange: (value: boolean) => void
}) {
	return (
		<label className='control-toggle'>
			<span>{label}</span>
			<input
				className='size-4 accent-fd-primary'
				type='checkbox'
				checked={checked}
				onChange={(event) => onChange(event.currentTarget.checked)}
			/>
		</label>
	)
}
export function Slider({
	label,
	value,
	min,
	max,
	step = 1,
	unit = '',
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	step?: number
	unit?: string
	onChange: (value: number) => void
}) {
	return (
		<label className='control-field'>
			<span className='flex justify-between gap-3'>
				{label}
				<output className='font-mono text-xs tabular-nums'>
					{value.toFixed(step < 1 ? 2 : 0)}
					{unit}
				</output>
			</span>
			<input
				aria-label={label}
				className='control-range'
				type='range'
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
			/>
		</label>
	)
}
export function NumberField({
	label,
	value,
	min,
	max,
	step = 0.1,
	integer = false,
	onChange,
}: {
	label: string
	value: number
	min?: number
	max?: number
	step?: number
	integer?: boolean
	onChange: (value: number) => void
}) {
	const [draft, setDraft] = useState(String(value))
	const [invalid, setInvalid] = useState(false)
	const emitted = useRef(value)
	const id = useId()
	useEffect(() => {
		if (emitted.current !== value) {
			setDraft(String(value))
			setInvalid(false)
		}
	}, [value])
	return (
		<label className='control-field'>
			{label}
			<input
				className='control-input font-mono tabular-nums'
				type='number'
				value={draft}
				min={min}
				max={max}
				step={step}
				aria-label={label}
				aria-invalid={invalid}
				aria-describedby={invalid ? id : undefined}
				onChange={(event) => {
					const text = event.currentTarget.value
					setDraft(text)
					const next = event.currentTarget.valueAsNumber
					const valid =
						text !== '' &&
						Number.isFinite(next) &&
						(min === undefined || next >= min) &&
						(max === undefined || next <= max) &&
						(!integer || Number.isInteger(next))
					setInvalid(!valid)
					if (valid) {
						emitted.current = next
						onChange(next)
					}
				}}
				onBlur={() => {
					if (!invalid) setDraft(String(value))
				}}
			/>
			{invalid && (
				<span id={id} className='text-xs' role='alert'>
					Enter {integer ? 'an integer' : 'a finite number'}
					{min !== undefined ? ` of at least ${min}` : ''}
					{max !== undefined ? ` and at most ${max}` : ''}.
				</span>
			)}
		</label>
	)
}
export function AxisSelect({
	label,
	value,
	onChange,
}: {
	label: string
	value: Axis
	onChange: (axis: Axis) => void
}) {
	return (
		<label className='control-field'>
			{label}
			<select
				className='control-input'
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.currentTarget.value as Axis)}
			>
				{(['x', 'y', 'z'] as const).map((axis) => (
					<option key={axis} value={axis}>
						{axis.toUpperCase()}
					</option>
				))}
			</select>
		</label>
	)
}
export function ControlGroup({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<fieldset className='control-group'>
			<legend className='mb-4 text-sm font-semibold'>{title}</legend>
			{children}
		</fieldset>
	)
}
