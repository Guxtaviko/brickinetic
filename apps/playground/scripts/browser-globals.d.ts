interface Window {
	__commits: number
	__media: { adds: number; removes: number; active: number }
	__getState: () => import('@react-three/fiber').RootState
	__unmount: () => void
	__REACT_DEVTOOLS_GLOBAL_HOOK__: {
		supportsFiber: boolean
		renderers: Map<number, unknown>
		inject: (renderer: unknown) => number
		onCommitFiberRoot: () => void
		onCommitFiberUnmount: () => void
		onPostCommitFiberRoot: () => void
	}
}
