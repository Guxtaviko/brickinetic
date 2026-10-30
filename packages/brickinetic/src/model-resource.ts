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
export const DEFAULT_PARTS_LIBRARY_PATH =
	'https://raw.githubusercontent.com/kulits/ldraw-parts/f3d0c2256398c28fbb682f4bb08c59eed81fd4f1/ldraw/'
export const RESOURCE_EVICTION_DELAY_MS = 1000

export function normalizePartsLibraryPath(
	path = DEFAULT_PARTS_LIBRARY_PATH,
	src?: string,
): string {
	const base = typeof location === 'undefined' ? src : location.href
	if (path.startsWith('/') && !base)
		throw new Error(
			'An origin-relative partsLibraryPath requires a browser origin',
		)
	let url: URL
	try {
		url = new URL(path, base)
	} catch {
		throw new Error(
			'partsLibraryPath must be an absolute URL or origin-relative path',
		)
	}
	if (
		!/^https?:$/.test(url.protocol) ||
		url.search ||
		url.hash ||
		(!path.startsWith('/') && !/^https?:\/\//i.test(path))
	)
		throw new Error(
			'partsLibraryPath must be an HTTP(S) URL or origin-relative path without query or fragment',
		)
	url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
	return url.href
}

function resourceKey(src: string, path?: string) {
	return JSON.stringify([src, normalizePartsLibraryPath(path, src)])
}

// Three r186 catches some nested geometry errors and returns partial models.
// Observe its existing resolver, without duplicating its parser or lookup rules.
function observeDependencies(loader: LDrawLoader) {
	const cache = (
		loader as unknown as {
			partsCache: {
				parseCache: {
					setData: (name: string, text: string) => void
					fetchData: (name: string) => Promise<string>
					ensureDataLoaded: (name: string) => Promise<void>
				}
			}
		}
	).partsCache?.parseCache
	if (!cache?.fetchData || !cache.ensureDataLoaded || !cache.setData)
		throw new Error(
			'Unsupported Three.js LDraw dependency cache; expected r186',
		)
	const failures = new Map<string, Error>()
	// r186 normalizes references, but not embedded FILE names. Register aliases
	// through its parser so OMR Windows paths and standardized subfolders match.
	const setData = cache.setData.bind(cache)
	cache.setData = (name, text) => {
		setData(name, text)
		const normalized = name.trim().replace(/\\/g, '/')
		if (normalized !== name) setData(normalized, text)
		const alias = normalized.startsWith('s/')
			? `parts/${normalized}`
			: normalized.startsWith('48/')
				? `p/${normalized}`
				: normalized
		if (alias !== normalized) setData(alias, text)
	}
	const fetchData = cache.fetchData.bind(cache)
	cache.fetchData = async (name) => {
		const text = await fetchData(name)
		if (!text.trim() || /^\s*(?:<!doctype\s+html|<html\b)/i.test(text))
			throw new Error(
				`Invalid LDraw response for part "${name}": empty document or HTML`,
			)
		return text
	}
	const ensure = cache.ensureDataLoaded.bind(cache)
	cache.ensureDataLoaded = async (name) => {
		try {
			await ensure(name)
		} catch (error) {
			failures.set(name, asError(error))
			throw error
		}
	}
	return failures
}

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

async function loadModel(
	src: string,
	partsLibraryPath: string,
): Promise<Group> {
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
	const loader = new LDrawLoader(manager)
	loader.setPartsLibraryPath(partsLibraryPath)
	const dependencyFailures = observeDependencies(loader)
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
				`Cannot load LDraw model "${src}": unresolved part "${missingReference[1]}" in "${partsLibraryPath}". Embed the part or configure a library containing it.`,
			)
		throw new Error(`Cannot parse LDraw model "${src}": ${message}`)
	}

	const failure = dependencyFailures.entries().next().value
	if (failure) {
		disposeModel(model)
		const [name, error] = failure
		throw new Error(
			`Cannot load LDraw model "${src}": unresolved part "${name}" in "${partsLibraryPath}": ${error.message}`,
		)
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

function getResource(src: string, path?: string): ResourceEntry {
	const key = resourceKey(src, path)
	const cached = resources.get(key)
	if (cached) return cached

	const entry: PendingEntry = { status: 'pending', promise: Promise.resolve() }
	entry.promise = loadModel(src, normalizePartsLibraryPath(path, src)).then(
		(model) => {
			const ready: ReadyEntry = {
				status: 'ready',
				model,
				consumers: 0,
				renderLeases: [],
				evictionTimer: undefined,
			}
			resources.set(key, ready)
			scheduleEviction(key, ready)
		},
		(error: unknown) => {
			resources.set(key, {
				status: 'failed',
				error: new Error(
					`Failed to load LDraw model "${src}": ${asError(error).message}`,
				),
				evictionTimer: undefined,
			})
		},
	)
	resources.set(key, entry)
	return entry
}

export function readModel(src: string, partsLibraryPath?: string): Group {
	const key = resourceKey(src, partsLibraryPath)
	const entry = getResource(src, partsLibraryPath)
	if (entry.status === 'pending') throw entry.promise
	if (entry.status === 'failed') {
		if (entry.evictionTimer === undefined) {
			entry.evictionTimer = setTimeout(() => {
				if (resources.get(key) === entry) resources.delete(key)
			}, 0)
		}
		throw entry.error
	}
	addRenderLease(key, entry)
	return entry.model
}

export function cloneModel(src: string, partsLibraryPath?: string): Group {
	return readModel(src, partsLibraryPath).clone(true) as Group
}

export function retainModel(
	src: string,
	partsLibraryPath?: string,
): () => void {
	const key = resourceKey(src, partsLibraryPath)
	const entry = resources.get(key)
	if (entry?.status !== 'ready')
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
		scheduleEviction(key, entry)
	}
}
