import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { ClientPlayground } from './client-playground'
import { layoutOptions } from './shared'

export const meta = () => [{ title: 'Playground · Brickinetic' }]
export default function PlaygroundPage() {
	return (
		<HomeLayout {...layoutOptions}>
			<div id='content'>
				<ClientPlayground />
			</div>
		</HomeLayout>
	)
}
