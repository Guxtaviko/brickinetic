import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'
import { quickstartCode } from './examples'

export function QuickstartExample() {
	return <DynamicCodeBlock lang='tsx' code={quickstartCode} />
}
