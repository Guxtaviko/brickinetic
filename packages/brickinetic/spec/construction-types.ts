import type { PreparedModel } from '../src/construction-units.js'

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Assert<T extends true> = T
type UnitArrayIsReadonly = Assert<
	Equal<PreparedModel['units'] extends Array<unknown> ? false : true, true>
>
type MatrixIsReadonly = Assert<
	Equal<
		PreparedModel['units'][number]['bindings'][number]['localMatrix'] extends number[]
			? false
			: true,
		true
	>
>
export type ConstructionReadonlyAssertions = [
	UnitArrayIsReadonly,
	MatrixIsReadonly,
]
