import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './spec',
	timeout: 120_000,
	expect: { timeout: 15_000 },
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4183',
		actionTimeout: 15_000,
		viewport: { width: 1280, height: 900 },
		launchOptions: {
			args: [
				'--use-gl=angle',
				'--use-angle=swiftshader',
				'--enable-unsafe-swiftshader',
			],
		},
		trace: 'retain-on-failure',
	},
	webServer: [
		{
			command: 'pnpm dev --host 127.0.0.1 --port 4183 --strictPort',
			url: 'http://127.0.0.1:4183',
			reuseExistingServer: false,
		},
		{
			command:
				'pnpm exec vite --config spec/vite.config.ts --host 127.0.0.1 --port 4185 --strictPort',
			url: 'http://127.0.0.1:4185/effects.html',
			reuseExistingServer: false,
		},
		{
			command: 'pnpm preview --host 127.0.0.1 --port 4184 --strictPort',
			url: 'http://127.0.0.1:4184',
			reuseExistingServer: false,
		},
	],
})
