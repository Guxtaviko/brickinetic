import {
	type BufferGeometry,
	type Group,
	LoadingManager,
	type Material,
	type Object3D,
	type Texture,
} from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'

type PendingEntry = {
	status: 'pending'
	promise: Promise<void>
}

type ReadyEntry = {
	status: 'ready'
	model: Group
	consumers: number
	renderLeases: RenderLease[]
	evictionTimer: ReturnType<typeof setTimeout> | undefined
}

type FailedEntry = {
	status: 'failed'
	error: Error
	evictionTimer: ReturnType<typeof setTimeout> | undefined
}

type ResourceEntry = PendingEntry | ReadyEntry | FailedEntry

type RenderLease = {
	timer: ReturnType<typeof setTimeout>
}

const resources = new Map<string, ResourceEntry>()
const colorConfigUrl = new URL('./assets/LDConfig.ldr', import.meta.url).href
export const RESOURCE_EVICTION_DELAY_MS = 1000

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error))
}

function clearEviction(entry: ReadyEntry) {
	if (entry.evictionTimer === undefined) return
	clearTimeout(entry.evictionTimer)
	entry.evictionTimer = undefined
}

function scheduleEviction(src: string, entry: ReadyEntry) {
	if (entry.consumers > 0 || entry.renderLeases.length > 0) return
	if (entry.evictionTimer !== undefined) clearTimeout(entry.evictionTimer)
	entry.evictionTimer = setTimeout(() => {
		entry.evictionTimer = undefined
		if (resources.get(src) !== entry) return
		if (entry.consumers > 0 || entry.renderLeases.length > 0) return
		resources.delete(src)
		disposeModel(entry.model)
	}, RESOURCE_EVICTION_DELAY_MS)
}

function addRenderLease(src: string, entry: ReadyEntry) {
	clearEviction(entry)
	const lease: RenderLease = {
		timer: setTimeout(() => {
			entry.renderLeases = entry.renderLeases.filter((item) => item !== lease)
			scheduleEviction(src, entry)
		}, RESOURCE_EVICTION_DELAY_MS),
	}
	entry.renderLeases.push(lease)
}

function disposeModel(model: Group) {
	const geometries = new Set<BufferGeometry>()
	const materials = new Set<Material>()
	const textures = new Set<Texture>()
	const collectUniformTextures = (value: unknown, seen = new Set<object>()) => {
		if (value === null || typeof value !== 'object' || seen.has(value)) return
		seen.add(value)
		if ('isTexture' in value && value.isTexture) {
			textures.add(value as Texture)
			return
		}
		if (Array.isArray(value)) {
			for (const item of value) collectUniformTextures(item, seen)
			return
		}
		for (const item of Object.values(value)) collectUniformTextures(item, seen)
	}

	model.traverse((object: Object3D) => {
		const renderable = object as Object3D & {
			geometry?: BufferGeometry
			material?: Material | Material[]
		}
		if (renderable.geometry) geometries.add(renderable.geometry)
		const objectMaterials = Array.isArray(renderable.material)
			? renderable.material
			: renderable.material
				? [renderable.material]
				: []
		for (const material of objectMaterials) {
			materials.add(material)
			for (const [key, value] of Object.entries(material)) {
				if (key === 'userData') continue
				if (
					value &&
					typeof value === 'object' &&
					'isTexture' in value &&
					value.isTexture
				)
					textures.add(value as Texture)
				if (key === 'uniforms') collectUniformTextures(value)
			}
		}
	})

	for (const geometry of geometries) geometry.dispose()
	for (const material of materials) material.dispose()
	for (const texture of textures) texture.dispose()
}

async function loadModel(src: string): Promise<Group> {
	let response: Response
	try {
		response = await fetch(src)
	} catch (error) {
		throw new Error(
			`Cannot load LDraw model "${src}" (network error): ${asError(error).message}`,
		)
	}

	if (!response.ok)
		throw new Error(
			`Cannot load LDraw model "${src}" (HTTP ${response.status})`,
		)

	const contentType = response.headers.get('content-type') ?? ''
	let text: string
	try {
		text = await response.text()
	} catch (error) {
		throw new Error(
			`Cannot read LDraw model "${src}": ${asError(error).message}`,
		)
	}

	if (
		/text\/html/i.test(contentType) ||
		/^\s*(?:<!doctype\s+html|<html\b)/i.test(text)
	)
		throw new Error(
			`Cannot load LDraw model "${src}": the response is HTML, not an MPD`,
		)
	if (!text.trim())
		throw new Error(`Cannot load LDraw model "${src}": the MPD is empty`)

	const manager = new LoadingManager()
	manager.setURLModifier((url) => {
		if (url === colorConfigUrl) return url
		throw new Error(
			`LDraw model "${src}" is not self-contained; unresolved geometry reference "${url}". Embed every referenced file in the MPD.`,
		)
	})

	const loader = new LDrawLoader(manager)
	loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
	loader.addDefaultMaterials()
	try {
		await loader.preloadMaterials(colorConfigUrl)
	} catch (error) {
		throw new Error(
			`Cannot load the bundled LDraw color configuration for "${src}": ${asError(error).message}`,
		)
	}

	let model: Group
	try {
		model = await new Promise<Group>((resolve, reject) => {
			loader.parse(text, resolve, reject)
		})
	} catch (error) {
		const message = asError(error).message
		const missingReference = message.match(
			/Subobject ["'](.+?)["'] could not be loaded/i,
		)
		if (missingReference)
			throw new Error(
				`LDraw model "${src}" is not self-contained; unresolved geometry reference "${missingReference[1]}". Embed every referenced file in the MPD.`,
			)
		throw new Error(`Cannot parse LDraw model "${src}": ${message}`)
	}

	let renderableGeometry = false
	model.traverse((object) => {
		if ('geometry' in object && object.geometry) renderableGeometry = true
	})
	if (!renderableGeometry)
		throw new Error(
			`Cannot load LDraw model "${src}": the MPD contains no renderable geometry`,
		)

	return model
}

function getResource(src: string): ResourceEntry {
	const cached = resources.get(src)
	if (cached) return cached

	const entry: PendingEntry = { status: 'pending', promise: Promise.resolve() }
	entry.promise = loadModel(src).then(
		(model) => {
			const ready: ReadyEntry = {
				status: 'ready',
				model,
				consumers: 0,
				renderLeases: [],
				evictionTimer: undefined,
			}
			resources.set(src, ready)
			scheduleEviction(src, ready)
		},
		(error: unknown) => {
			resources.set(src, {
				status: 'failed',
				error: new Error(
					`Failed to load LDraw model "${src}": ${asError(error).message}`,
				),
				evictionTimer: undefined,
			})
		},
	)
	resources.set(src, entry)
	return entry
}

export function readModel(src: string): Group {
	const entry = getResource(src)
	if (entry.status === 'pending') throw entry.promise
	if (entry.status === 'failed') {
		if (entry.evictionTimer === undefined) {
			entry.evictionTimer = setTimeout(() => {
				if (resources.get(src) === entry) resources.delete(src)
			}, 0)
		}
		throw entry.error
	}
	addRenderLease(src, entry)
	return entry.model
}

export function cloneModel(src: string): Group {
	return readModel(src).clone(true) as Group
}

export function retainModel(src: string): () => void {
	const entry = resources.get(src)
	if (!entry || entry.status !== 'ready')
		throw new Error(`Cannot retain LDraw model "${src}" before it has loaded`)

	clearEviction(entry)
	const renderLease = entry.renderLeases.shift()
	if (renderLease) clearTimeout(renderLease.timer)
	entry.consumers++

	let active = true
	return () => {
		if (!active) return
		active = false
		entry.consumers--
		scheduleEviction(src, entry)
	}
}
