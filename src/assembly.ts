import type { Object3D } from 'three'
import { Vector3 } from 'three'

export type AssemblyGroup = {
	members: Object3D[]
	baselines: Vector3[]
	offset: Vector3
}
const names = [
	'2441.dat',
	'3623.dat',
	'3623.dat',
	'3023.dat',
	'3022.dat',
	'3794a.dat',
	'3794a.dat',
	'3794a.dat',
	'3794a.dat',
	'4865a.dat',
	'4865a.dat',
	'3023.dat',
	'u8200.dat',
	'4595.dat',
	'2412a.dat',
	'2412a.dat',
	'3005.dat',
	'3005.dat',
	'3298p56.dat',
	'3829c01.dat',
	'3021.dat',
	'3070b.dat',
	'4276b.dat',
	'2452.dat',
	'3040b.dat',
	'2431.dat',
	'4624.dat',
	'3641.dat',
	'3641.dat',
	'4624.dat',
	'3641.dat',
	'4624.dat',
	'3641.dat',
	'4624.dat',
	'1477 - Minifig.ldr',
]
// Curated membership for the original car, in source order: chassis, body, details, wheels and driver.
export const manualGroups = [
	[0, 1, 2, 3, 4],
	[5, 6, 7, 8, 9, 10, 11, 12],
	[13, 14, 15, 16, 17, 18, 19],
	[20, 21, 22, 23, 24, 25],
	[26, 27, 28, 29, 30, 31, 32, 33],
	[34],
]

export function makeGroups(
	root: Object3D,
	mode: 'source' | 'manual',
): AssemblyGroup[] {
	const children = root.children
	if (
		children.length !== names.length ||
		children.some(
			(child, index) =>
				child.name.replace('../parts/', '').toLowerCase() !==
				names[index].toLowerCase(),
		)
	)
		throw new Error('Car hierarchy does not match the grouping manifest')
	const membership =
		mode === 'manual'
			? manualGroups
			: Array.from({ length: 9 }, (_, step) =>
					children.flatMap((child, i) =>
						child.userData.buildingStep === step ? [i] : [],
					),
				)
	validateMembership(membership, children.length)
	return membership.map((indices, index) => ({
		members: indices.map((i) => children[i]),
		baselines: indices.map((i) => children[i].position.clone()),
		offset: new Vector3((index % 2 ? 1 : -1) * 45, -80, 0),
	}))
}

export function validateMembership(membership: number[][], count: number) {
	const seen = new Set<number>()
	for (const indices of membership)
		for (const index of indices) {
			if (
				!Number.isInteger(index) ||
				index < 0 ||
				index >= count ||
				seen.has(index)
			)
				throw new Error(`Invalid or duplicate group member ${index}`)
			seen.add(index)
		}
	if (seen.size !== count || membership.some((group) => group.length === 0))
		throw new Error('Grouping does not cover all model geometry')
}

export function applyProgress(groups: AssemblyGroup[], progress: number) {
	const p = Math.max(0, Math.min(1, progress))
	groups.forEach((group, index) => {
		const amount = 1 - Math.max(0, Math.min(1, p * groups.length - index))
		group.members.forEach((member, i) => {
			member.position
				.copy(group.baselines[i])
				.addScaledVector(group.offset, amount)
		})
	})
}
