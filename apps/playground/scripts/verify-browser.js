// Run against the Vite playground with: playwright-cli run-code --filename=apps/playground/scripts/verify-browser.js
// Uses a deterministic embedded MPD for behavioral tests; real OMR loading is checked separately.
async (page) => {
	const checks = []
	const check = (value, message) => {
		if (!value) throw new Error(message)
		checks.push(message)
	}
	const near = (a, b) => Math.abs(a - b) < 1e-6
	const base = new URL(page.url()).origin
	const fixture =
		'0 FILE test.ldr\n0 Test\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n'
	let modelRequests = 0
	await page.route('**/models/*.mpd', (route) => {
		modelRequests++
		return route.fulfill({ contentType: 'text/plain', body: fixture })
	})
	await page.addInitScript(() => {
		window.__commits = 0
		let rendererId = 0
		window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
			supportsFiber: true,
			renderers: new Map(),
			inject: (renderer) => {
				const id = ++rendererId
				window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.set(id, renderer)
				return id
			},
			onCommitFiberRoot: () => window.__commits++,
			onCommitFiberUnmount: () => {},
			onPostCommitFiberRoot: () => {},
		}
		const original = window.matchMedia.bind(window)
		window.__media = { adds: 0, removes: 0, active: 0 }
		window.matchMedia = (name) => {
			const query = original(name)
			if (name !== '(prefers-reduced-motion: reduce)') return query
			const add = query.addEventListener.bind(query)
			const remove = query.removeEventListener.bind(query)
			query.addEventListener = (type, listener, ...args) => {
				if (type === 'change') {
					window.__media.adds++
					window.__media.active++
				}
				return add(type, listener, ...args)
			}
			query.removeEventListener = (type, listener, ...args) => {
				if (type === 'change') {
					window.__media.removes++
					window.__media.active--
				}
				return remove(type, listener, ...args)
			}
			return query
		}
	})
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await page.goto(base)
	const ready = () =>
		page
			.getByTestId('model-status')
			.filter({ hasText: 'Model ready' })
			.waitFor()
	await ready()
	await page.evaluate(async () => {
		const url = performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.find((url) => url.includes('/@react-three_fiber.js?v='))
		const fiber = await import(url)
		window.__getState = () =>
			fiber._roots.get(document.querySelector('canvas')).store.getState()
		window.__unmount = () =>
			fiber.unmountComponentAtNode(document.querySelector('canvas'))
	})
	const pose = (name = 'inspection-primary') =>
		page.evaluate((name) => {
			const state = window.__getState()
			const instance = state.scene.getObjectByName(name)
			const base = instance.children[0]
			const float = base.getObjectByName('brickinetic-float')
			const spin = base.getObjectByName('brickinetic-spin')
			return {
				position: float.position.toArray(),
				rotation: spin.rotation.toArray().slice(0, 3),
				basePosition: base.position.toArray(),
				baseRotation: base.rotation.toArray().slice(0, 3),
				scale: base.scale.toArray(),
				centerOffset: spin.children[0].position.toArray(),
				subscribers: state.internal.subscribers.length,
				media: window.__media.active,
			}
		}, name)
	const advance = (delta) =>
		page.evaluate((delta) => {
			const state = window.__getState()
			state.advance(state.clock.elapsedTime + delta, true)
		}, delta)
	const slider = async (label, value) => {
		const input = page.getByRole('slider', { name: label, exact: true })
		await input.fill(String(value))
	}
	await page.getByLabel('Render loop', { exact: true }).selectOption('never')
	await page.getByLabel('Float', { exact: true }).uncheck()
	await page.getByLabel('Spin', { exact: true }).uncheck()
	let state = await pose()
	check(
		state.position.every((x) => x === 0) &&
			state.rotation.every((x) => x === 0),
		'disabled presets restore identity',
	)
	check(
		state.centerOffset.some((x) => x !== 0),
		'centering changes the inner orientation offset',
	)
	await page.getByLabel('Center bounds', { exact: true }).uncheck()
	check(
		(await pose()).centerOffset.every((x) => x === 0),
		'uncentered pivot has no centering offset',
	)
	await page.getByLabel('Center bounds', { exact: true }).check()
	await page.getByLabel('Float', { exact: true }).check()
	await page.getByLabel('Spin', { exact: true }).check()
	for (const axis of ['x', 'y', 'z']) {
		await page.getByLabel('Float axis', { exact: true }).selectOption(axis)
		await page.getByLabel('Spin axis', { exact: true }).selectOption(axis)
		// Restart both even for the initial Y default.
		await page.getByLabel('Float', { exact: true }).uncheck()
		await page.getByLabel('Spin', { exact: true }).uncheck()
		await page.getByLabel('Float', { exact: true }).check()
		await page.getByLabel('Spin', { exact: true }).check()
		await advance(1)
		state = await pose()
		const index = ['x', 'y', 'z'].indexOf(axis)
		check(
			state.position.every((value, i) =>
				near(value, i === index ? 5 * Math.sin(0.8) : 0),
			),
			`float numeric ${axis} axis`,
		)
		check(
			state.rotation.every((value, i) => near(value, i === index ? 0.2 : 0)),
			`spin numeric ${axis} axis`,
		)
	}
	await page.getByLabel('Float axis', { exact: true }).selectOption('x')
	state = await pose()
	check(
		state.position.every((x) => x === 0) && near(state.rotation[2], 0.2),
		'axis change clears old float offset and preserves spin phase',
	)
	await slider('Position X', 24)
	await slider('Rotation Y', 90)
	await slider('Uniform scale', 1.5)
	await advance(0.5)
	state = await pose()
	check(
		near(state.basePosition[0], 24) &&
			near(state.baseRotation[1], Math.PI / 2) &&
			near(state.scale[0], 1.5),
		'base-transform updates remain independent',
	)
	check(
		near(state.rotation[0], 0) && near(state.rotation[2], 0.3),
		'selected Z spin stays on local Z with rotated base',
	)
	await page.getByLabel('Second instance', { exact: true }).check()
	await advance(1)
	const second = await pose('inspection-secondary')
	check(
		second.position[0] !== 0 &&
			second.position[1] === 0 &&
			second.position[2] === 0 &&
			near(second.rotation[2], -0.12),
		'second instance follows selected axes with independent speed',
	)
	check(second.media === 2, 'two active preference subscriptions')
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.waitForTimeout(100)
	state = await pose()
	check(
		state.position.every((x) => x === 0) &&
			state.rotation.every((x) => x === 0),
		'live reduced motion restores primary offsets',
	)
	check(
		(await pose('inspection-secondary')).rotation.every((x) => x === 0),
		'live reduced motion restores second instance',
	)
	await page.getByLabel('Reduced motion', { exact: true }).selectOption('never')
	await advance(1)
	check(
		(await pose()).rotation[2] > 0 && (await pose()).media === 0,
		'explicit override animates and removes system listeners',
	)
	await page
		.getByLabel('Reduced motion', { exact: true })
		.selectOption('system')
	await page.waitForTimeout(100)
	check(
		(await pose()).rotation.every((value) => value === 0),
		'returning to system rechecks an active reduced-motion request',
	)
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await page.waitForTimeout(100)
	check(
		(await pose()).media === 2,
		'returning to system policy restores exactly two listeners',
	)
	await page
		.getByLabel('Reduced motion', { exact: true })
		.selectOption('always')
	await page.waitForTimeout(100)
	state = await pose()
	const reducedSecond = await pose('inspection-secondary')
	check(
		state.position.every((value) => value === 0) &&
			state.rotation.every((value) => value === 0) &&
			reducedSecond.position.every((value) => value === 0) &&
			reducedSecond.rotation.every((value) => value === 0) &&
			state.media === 0 &&
			reducedSecond.media === 0,
		'always reduced motion restores both instances without preference listeners',
	)
	await page
		.getByLabel('Reduced motion', { exact: true })
		.selectOption('system')
	await page.waitForTimeout(100)
	check(
		(await pose()).media === 2,
		'leaving always reduced motion resumes system listeners',
	)
	await page.getByLabel('Second instance', { exact: true }).uncheck()
	await page.waitForTimeout(100)
	check(
		(await pose()).media === 1,
		'unmounted second instance removes its listener',
	)
	await page.getByLabel('Float', { exact: true }).uncheck()
	await page.getByLabel('Spin', { exact: true }).uncheck()
	await page.getByLabel('Float', { exact: true }).check()
	await page.getByLabel('Spin', { exact: true }).check()
	await page.getByRole('button', { name: 'Advance 1/60 second' }).click()
	check(
		near((await pose()).rotation[2], 0.2 / 60),
		'manual button advances seconds rather than milliseconds',
	)
	const before = await pose()
	await page.waitForTimeout(200)
	check(
		JSON.stringify((await pose()).rotation) === JSON.stringify(before.rotation),
		'manual mode remains still without advance',
	)
	await page.getByLabel('Render loop', { exact: true }).selectOption('demand')
	const moving = (await pose()).rotation[2]
	await page.waitForTimeout(250)
	check(
		(await pose()).rotation[2] !== moving,
		'demand loop sustains dynamic motion',
	)
	await slider('Float speed', 0)
	await slider('Spin speed', 0)
	await page.waitForTimeout(150)
	const frames = await page.evaluate(() => window.__getState().internal.frames)
	check(frames === 0, 'zero-speed presets stop sustaining demand frames')
	await slider('Spin speed', 0.2)
	await page.getByLabel('Render loop', { exact: true }).selectOption('always')
	await page.waitForTimeout(200)
	const commits = await page.evaluate(() => window.__commits)
	const angle = (await pose()).rotation[2]
	await page.waitForTimeout(350)
	check(
		commits > 0 &&
			(await page.evaluate(() => window.__commits)) === commits &&
			(await pose()).rotation[2] !== angle,
		'animation changes transforms without React commits',
	)
	await page.getByLabel('Float', { exact: true }).uncheck()
	await page.getByLabel('Spin', { exact: true }).uncheck()
	state = await pose()
	check(
		state.position.every((x) => x === 0) &&
			state.rotation.every((x) => x === 0) &&
			state.basePosition[0] === 24,
		'disabling restores the latest base pose',
	)
	await page.getByLabel('Model', { exact: true }).selectOption('speedboat')
	await ready()
	await page.getByLabel('Model', { exact: true }).selectOption('spaceship')
	await ready()
	check(
		(await page.getByLabel('Float axis', { exact: true }).inputValue()) === 'x',
		'model selection preserves motion settings',
	)
	await page.getByLabel('Spin', { exact: true }).check()
	await page.waitForTimeout(100)
	await page.evaluate(() => window.__unmount())
	await page.waitForTimeout(600)
	check(
		(await page.evaluate(() => window.__media.active)) === 0,
		'root unmount cleans all preference listeners',
	)
	await page.addInitScript(() => {
		window.matchMedia = undefined
	})
	await page.goto(base)
	await ready()
	await page.waitForTimeout(100)
	const missingApi = await page.evaluate(async () => {
		const url = performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.find((url) => url.includes('/@react-three_fiber.js?v='))
		const fiber = await import(url)
		const state = fiber._roots
			.get(document.querySelector('canvas'))
			.store.getState()
		return state.scene.getObjectByName('brickinetic-spin').rotation.y
	})
	check(missingApi > 0, 'missing matchMedia allows motion')
	let repaired = false
	await page.route('**/models/car.mpd', (route) =>
		route.fulfill({
			contentType: 'text/plain',
			body: '0 FILE missing.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 deliberately-missing.dat\n',
		}),
	)
	await page.route('**/deliberately-missing.dat', (route) =>
		route.fulfill({
			status: repaired ? 200 : 404,
			contentType: 'text/plain',
			body: repaired ? fixture : 'missing',
		}),
	)
	await page.getByLabel('Model', { exact: true }).selectOption('speedboat')
	await ready()
	await page.waitForTimeout(1200)
	await page.getByLabel('Model', { exact: true }).selectOption('car')
	await page.getByRole('alert').waitFor()
	check(
		(await page.getByRole('alert').innerText()).includes(
			'deliberately-missing.dat',
		),
		'unavailable part produces an identifiable viewport error',
	)
	repaired = true
	await page.getByRole('button', { name: 'Retry model' }).click()
	await ready()
	check(
		(await page.getByRole('alert').count()) === 0,
		'repair and retry recover the failed model',
	)
	const requestsBeforeSimulation = modelRequests
	await page.getByLabel('Simulate loading failure', { exact: true }).check()
	await page.getByRole('alert').waitFor()
	check(
		modelRequests === requestsBeforeSimulation,
		'simulated failure exercises the boundary without model network requests',
	)
	await page.getByLabel('Simulate loading failure', { exact: true }).uncheck()
	await ready()
	check(
		(await page.getByRole('alert').count()) === 0,
		'turning simulation off reloads the selected model',
	)
	await page.getByLabel('Simulate loading failure', { exact: true }).check()
	await page.getByRole('alert').waitFor()
	await page.getByRole('button', { name: 'Retry model' }).click()
	await ready()
	check(
		(await page
			.getByLabel('Simulate loading failure', { exact: true })
			.isChecked()) === false,
		'retry clears the failure simulation and recovers',
	)
	return { passed: checks.length, checks }
}
