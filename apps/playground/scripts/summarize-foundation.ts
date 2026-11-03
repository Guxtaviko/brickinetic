import { readFile } from 'node:fs/promises'

interface Measurement {
	model: string
	baseline: boolean
	instances: number
	edges: boolean
	effect?: string
	effectSetupMs?: number | null
	effectUpdateMs?: number[]
	loaderMs?: number
	loaderStages?: {
		transportMs?: number
		materialsMs?: number
		parseMs?: number
	}
	preparationMs?: number | null
	bindingMs?: number[]
	cloneMs?: number[]
	frames?: number[]
	calls?: number
	units?: number | null
	renderables?: number
	error?: string
}
const path = process.argv[2] ?? '../../docs/evidence/m3.1-measurements.json'
const report = JSON.parse(await readFile(path, 'utf8')) as {
	results: Measurement[]
}
const percentile = (values: number[], fraction: number) => {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted.length ? sorted[Math.ceil(fraction * sorted.length) - 1] : null
}
const groups = new Map<string, Measurement[]>()
for (const row of report.results) {
	const key = JSON.stringify([
		row.model,
		row.baseline,
		row.instances,
		row.edges,
		row.effect ?? 'none',
	])
	const group = groups.get(key) ?? []
	group.push(row)
	groups.set(key, group)
}
for (const [key, rows] of groups) {
	const good = rows.filter((row) => !row.error)
	const values = (pick: (row: Measurement) => number | null | undefined) =>
		good.map(pick).filter((value): value is number => value != null)
	const frames = good.flatMap((row) => row.frames ?? [])
	const distribution = (numbers: number[]) => ({
		median: percentile(numbers, 0.5),
		p95: percentile(numbers, 0.95),
		p99: percentile(numbers, 0.99),
	})
	console.log(
		JSON.stringify({
			config: JSON.parse(key),
			runs: good.length,
			failures: rows.length - good.length,
			loaderMs: distribution(values((row) => row.loaderMs)),
			transportMs: distribution(values((row) => row.loaderStages?.transportMs)),
			materialsMs: distribution(values((row) => row.loaderStages?.materialsMs)),
			parseMs: distribution(values((row) => row.loaderStages?.parseMs)),
			preparationMs: distribution(values((row) => row.preparationMs)),
			bindingMs: distribution(good.flatMap((row) => row.bindingMs ?? [])),
			cloneMs: distribution(good.flatMap((row) => row.cloneMs ?? [])),
			effectSetupMs: distribution(values((row) => row.effectSetupMs)),
			effectUpdateMs: distribution(
				good.flatMap((row) => row.effectUpdateMs ?? []),
			),
			frameMs: distribution(frames),
			frames: frames.length,
			calls: distribution(values((row) => row.calls)),
			units: good[0]?.units,
			renderables: good[0]?.renderables,
		}),
	)
}
