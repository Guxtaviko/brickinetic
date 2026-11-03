import { Box3, Matrix4, type Object3D, Vector3 } from 'three'

/** A root-relative child-index path. Residual units use the container path. */
export type OccurrencePath = readonly number[]

export interface ConstructionUnit {
	readonly id: string
	readonly kind: 'part' | 'residual'
	readonly path: OccurrencePath
	readonly roots: readonly OccurrencePath[]
}

function isRenderable(node: Object3D): boolean {
	return 'geometry' in node && !!node.geometry
}

/** Select maximal parts and direct geometry without changing the source tree. */
export function selectConstructionUnits(
	model: Object3D,
	source = '<model>',
): readonly ConstructionUnit[] {
	model.updateMatrixWorld(true)
	const validate = (node: Object3D, path: number[]) => {
		const occurrence = path.join('/') || '<root>'
		const matrix = node.matrixWorld.elements
		if (
			matrix.some((value) => !Number.isFinite(value)) ||
			node.matrixWorld.determinant() === 0
		)
			throw new Error(
				`Cannot prepare "${source}" at ${occurrence}: nonfinite or singular transform`,
			)
		if (
			node.matrixWorld
				.clone()
				.invert()
				.elements.some((value) => !Number.isFinite(value))
		)
			throw new Error(
				`Cannot prepare "${source}" at ${occurrence}: transform inverse is nonfinite`,
			)
		if (
			('isSprite' in node && node.isSprite) ||
			(isRenderable(node) &&
				(!('isMesh' in node || 'isLineSegments' in node) ||
					'isSkinnedMesh' in node ||
					'isInstancedMesh' in node))
		)
			throw new Error(
				`Cannot prepare "${source}" at ${occurrence}: unsupported renderable ${node.type}`,
			)
		if (isRenderable(node) && node.children.length)
			throw new Error(
				`Cannot prepare "${source}" at ${occurrence}: renderable has child objects`,
			)
		node.children.forEach((child, index) => {
			validate(child, [...path, index])
		})
	}
	validate(model, [])
	const units: ConstructionUnit[] = []
	const visit = (node: Object3D, path: number[]) => {
		if (
			node.userData.type === 'Part' ||
			node.userData.type === 'Unofficial_Part'
		) {
			let nonempty = false
			node.traverse((child) => {
				if (isRenderable(child)) nonempty = true
			})
			if (nonempty)
				units.push({
					id: `${path.join('/')}:part`,
					kind: 'part',
					path,
					roots: [path],
				})
			return
		}
		if (isRenderable(node)) {
			units.push({
				id: `${path.join('/')}:residual`,
				kind: 'residual',
				path,
				roots: [path],
			})
			return
		}
		const roots = node.children.flatMap((child, index) =>
			isRenderable(child) ? [[...path, index]] : [],
		)
		if (roots.length)
			units.push({
				id: `${path.join('/')}:residual`,
				kind: 'residual',
				path,
				roots,
			})
		node.children.forEach((child, index) => {
			if (!isRenderable(child)) visit(child, [...path, index])
		})
	}
	visit(model, [])
	return units
}

export interface RootSnapshot {
	readonly path: OccurrencePath
	readonly nodeType: string
	readonly localMatrix: readonly number[]
	readonly parentMatrix: readonly number[]
	readonly modelMatrix: readonly number[]
}

export interface UnitSnapshot extends ConstructionUnit {
	readonly sourceName: string | null
	readonly sourceType: string | null
	readonly step: number | null
	readonly startingStep: boolean | null
	readonly parentPath: OccurrencePath | null
	readonly submodelPath: OccurrencePath | null
	readonly bindings: readonly RootSnapshot[]
	readonly renderables: readonly {
		readonly path: OccurrencePath
		readonly nodeType: string
	}[]
	readonly bounds: BoundsSnapshot | null
	readonly center: readonly number[] | null
}

export interface BoundsSnapshot {
	readonly min: readonly number[]
	readonly max: readonly number[]
}

export interface PreparedModel {
	readonly source: string
	readonly units: readonly UnitSnapshot[]
	readonly bounds: BoundsSnapshot | null
	readonly center: readonly number[] | null
	readonly numBuildingSteps: number | null
	readonly observations: readonly {
		readonly path: OccurrencePath
		readonly nodeType: string
		readonly sourceName: string | null
		readonly sourceType: string | null
		readonly step: number | null
		readonly startingStep: boolean | null
	}[]
}

const orientation = new Matrix4().makeRotationX(Math.PI)

function boundsOf(roots: readonly Object3D[]): BoundsSnapshot | null {
	const bounds = new Box3().makeEmpty()
	for (const root of roots)
		root.traverse((node) => {
			if (!isRenderable(node)) return
			const geometry = (
				node as Object3D & { geometry: import('three').BufferGeometry }
			).geometry
			if (!geometry.boundingBox) geometry.computeBoundingBox()
			if (geometry.boundingBox)
				bounds.union(
					geometry.boundingBox
						.clone()
						.applyMatrix4(
							new Matrix4().multiplyMatrices(orientation, node.matrixWorld),
						),
				)
		})
	if (bounds.isEmpty()) return null
	return Object.freeze({
		min: Object.freeze(bounds.min.toArray()),
		max: Object.freeze(bounds.max.toArray()),
	})
}

export function preparedCenter(prepared: PreparedModel): Vector3 {
	return prepared.center
		? new Vector3().fromArray(prepared.center)
		: new Vector3()
}

function centerOf(bounds: BoundsSnapshot | null): readonly number[] | null {
	return bounds
		? Object.freeze(
				new Vector3()
					.fromArray(bounds.min)
					.add(new Vector3().fromArray(bounds.max))
					.multiplyScalar(0.5)
					.toArray(),
			)
		: null
}

function resolvePath(root: Object3D, path: OccurrencePath): Object3D {
	return path.reduce((node, index) => {
		const child = node.children[index]
		if (!child)
			throw new Error(`Missing construction occurrence ${path.join('/')}`)
		return child
	}, root)
}

export function prepareConstructionUnits(
	model: Object3D,
	source: string,
): PreparedModel {
	const observations: PreparedModel['observations'][number][] = []
	const observe = (node: Object3D, path: number[]) => {
		if ('isGroup' in node && node.isGroup)
			observations.push(
				Object.freeze({
					path: Object.freeze(path),
					nodeType: node.type,
					sourceName:
						typeof node.userData.fileName === 'string'
							? node.userData.fileName
							: null,
					sourceType:
						typeof node.userData.type === 'string' ? node.userData.type : null,
					step:
						typeof node.userData.buildingStep === 'number'
							? node.userData.buildingStep
							: null,
					startingStep:
						typeof node.userData.startingBuildingStep === 'boolean'
							? node.userData.startingBuildingStep
							: null,
				}),
			)
		node.children.forEach((child, index) => {
			observe(child, [...path, index])
		})
	}
	observe(model, [])
	const units = selectConstructionUnits(model, source).map((unit) => {
		const owner = resolvePath(model, unit.path)
		let submodelPath: number[] | null = null
		for (let length = unit.path.length; length >= 0; length--) {
			const path = unit.path.slice(0, length)
			if (resolvePath(model, path).userData.type === 'Model') {
				submodelPath = [...path]
				break
			}
		}
		const bindings = unit.roots.map((path) => {
			const node = resolvePath(model, path)
			return Object.freeze({
				path: Object.freeze([...path]),
				nodeType: node.type,
				localMatrix: Object.freeze([...node.matrix.elements]),
				modelMatrix: Object.freeze([...node.matrixWorld.elements]),
				parentMatrix: Object.freeze([
					...(node.parent?.matrixWorld.elements ?? new Matrix4().elements),
				]),
			})
		})
		const renderables: {
			readonly path: OccurrencePath
			readonly nodeType: string
		}[] = []
		const collect = (node: Object3D, path: number[]) => {
			if (isRenderable(node))
				renderables.push(
					Object.freeze({ path: Object.freeze(path), nodeType: node.type }),
				)
			node.children.forEach((child, index) => {
				collect(child, [...path, index])
			})
		}
		for (const path of unit.roots) collect(resolvePath(model, path), [...path])
		const bounds = boundsOf(unit.roots.map((path) => resolvePath(model, path)))
		return Object.freeze({
			...unit,
			path: Object.freeze([...unit.path]),
			roots: Object.freeze(unit.roots.map((path) => Object.freeze([...path]))),
			sourceName:
				typeof owner.userData.fileName === 'string'
					? owner.userData.fileName
					: null,
			sourceType:
				typeof owner.userData.type === 'string' ? owner.userData.type : null,
			step:
				typeof owner.userData.buildingStep === 'number'
					? owner.userData.buildingStep
					: null,
			startingStep:
				typeof owner.userData.startingBuildingStep === 'boolean'
					? owner.userData.startingBuildingStep
					: null,
			parentPath: unit.path.length
				? Object.freeze(unit.path.slice(0, -1))
				: null,
			submodelPath: submodelPath ? Object.freeze(submodelPath) : null,
			bindings: Object.freeze(bindings),
			renderables: Object.freeze(renderables),
			bounds,
			center: centerOf(bounds),
		})
	})
	const bounds = boundsOf([model])
	return Object.freeze({
		source,
		units: Object.freeze(units),
		bounds,
		center: centerOf(bounds),
		numBuildingSteps:
			typeof model.userData.numBuildingSteps === 'number'
				? model.userData.numBuildingSteps
				: null,
		observations: Object.freeze(observations),
	})
}

export function bindConstructionUnits(
	model: Object3D,
	prepared: PreparedModel,
) {
	const selected = selectConstructionUnits(model)
	for (const entry of prepared.observations)
		if (resolvePath(model, entry.path).type !== entry.nodeType)
			throw new Error(
				`Clone construction occurrence ${entry.path.join('/')} has unexpected type`,
			)
	if (
		selected.length !== prepared.units.length ||
		selected.some(
			(unit, index) =>
				unit.id !== prepared.units[index].id ||
				JSON.stringify(unit.roots) !==
					JSON.stringify(prepared.units[index].roots),
		)
	)
		throw new Error(
			'Clone construction ownership does not match its prepared source',
		)
	for (const unit of prepared.units) {
		let count = 0
		for (const path of unit.roots)
			resolvePath(model, path).traverse((node) => {
				if (isRenderable(node)) count++
			})
		if (
			count !== unit.renderables.length ||
			unit.renderables.some(
				(entry) => resolvePath(model, entry.path).type !== entry.nodeType,
			)
		)
			throw new Error(
				`Clone construction renderables do not match at ${unit.id}`,
			)
	}
	return prepared.units.map((unit) => ({
		unit,
		roots: unit.bindings.map((binding) => {
			const node = resolvePath(model, binding.path)
			if (node.type !== binding.nodeType)
				throw new Error(
					`Clone construction occurrence ${binding.path.join('/')} has unexpected type`,
				)
			return node
		}),
	}))
}

export function displaceConstructionUnit(
	binding: ReturnType<typeof bindConstructionUnits>[number],
	displacement: Vector3,
) {
	binding.roots.forEach((node, index) => {
		const snapshot = binding.unit.bindings[index]
		const parent = new Matrix4().fromArray(snapshot.parentMatrix)
		const inverse = new Matrix4().multiplyMatrices(orientation, parent).invert()
		const origin = new Vector3().applyMatrix4(inverse)
		const delta = displacement.clone().applyMatrix4(inverse).sub(origin)
		const baseline = new Matrix4().fromArray(snapshot.localMatrix)
		const position = new Vector3().setFromMatrixPosition(baseline).add(delta)
		baseline.setPosition(position)
		baseline.decompose(node.position, node.quaternion, node.scale)
		node.matrix.copy(baseline)
		node.matrixWorldNeedsUpdate = true
	})
}
