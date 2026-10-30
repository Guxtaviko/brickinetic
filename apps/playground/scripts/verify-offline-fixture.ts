import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type Group, LineSegments, LoadingManager, Mesh } from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'

const modelPath = resolve(
	import.meta.dirname,
	'../../../../packages/brickinetic/spec/fixtures/car-self-contained.mpd',
)
const source = await readFile(modelPath, 'utf8')
const externalRequests: string[] = []
const manager = new LoadingManager()
manager.setURLModifier((url) => {
	externalRequests.push(url)
	throw new Error(`Unexpected external LDraw request: ${url}`)
})

const loader = new LDrawLoader(manager)
loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
loader.addDefaultMaterials()

const model = await new Promise<Group>((resolveModel, reject) => {
	loader.parse(source, resolveModel, reject)
})

let meshes = 0
let lineObjects = 0
model.traverse((object) => {
	if (object instanceof Mesh) meshes++
	if (
		object instanceof LineSegments ||
		('isConditionalLine' in object && object.isConditionalLine)
	)
		lineObjects++
})

if (externalRequests.length > 0)
	throw new Error(
		`Unexpected external requests: ${externalRequests.join(', ')}`,
	)
if (meshes === 0)
	throw new Error('The prepared MPD has no renderable mesh geometry')

console.log(
	`Loaded self-contained car fixture without external requests (${meshes} meshes, ${lineObjects} line objects).`,
)
