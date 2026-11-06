import { type ComponentType, useEffect, useState } from 'react'
import type { AppProps } from '../App'

export function ClientPlayground({ compact = false }: AppProps) {
	const [Playground, setPlayground] = useState<ComponentType<AppProps>>()
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
			<Playground compact={compact} />
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
