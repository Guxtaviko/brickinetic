import { type ComponentType, useEffect, useState } from 'react'

export function ClientPlayground() {
	const [Playground, setPlayground] = useState<ComponentType>()
	useEffect(() => {
		let active = true
		void import('../App').then((module) => {
			if (active) setPlayground(() => module.default)
		})
		return () => {
			active = false
		}
	}, [])
	return Playground ? (
		<div className='playground'>
			<Playground />
		</div>
	) : (
		<div
			className='flex min-h-96 items-center justify-center text-fd-muted-foreground'
			role='status'
		>
			Preparing model viewer…
		</div>
	)
}
