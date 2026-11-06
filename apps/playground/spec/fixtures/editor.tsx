import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
	type BezierCurve,
	BezierEditor,
} from '../../src/components/BezierEditor.js'
import '../../src/styles/globals.css'

function Fixture() {
	const [value, setValue] = useState<BezierCurve>([0.25, 0.1, 0.25, 1])
	return (
		<main className='mx-auto max-w-lg p-5'>
			<h1 className='mb-6 text-2xl font-semibold'>Easing curve</h1>
			<BezierEditor value={value} onChange={setValue} />
			<output data-testid='controlled-curve'>{JSON.stringify(value)}</output>
		</main>
	)
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(
	<StrictMode>
		<Fixture />
	</StrictMode>,
)
