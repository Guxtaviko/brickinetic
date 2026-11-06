import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page'
import { useParams } from 'react-router'
import { layoutOptions } from './shared'
import { source } from './source'

export function meta({
	params,
}: {
	params: Record<string, string | undefined>
}) {
	const page = source.getPage((params['*'] ?? '').split('/').filter(Boolean))
	return [{ title: `${page?.data.title ?? 'Page not found'} · Brickinetic` }]
}

export default function Documentation() {
	const params = useParams()
	const page = source.getPage((params['*'] ?? '').split('/').filter(Boolean))
	if (!page)
		return (
			<DocsLayout {...layoutOptions} tree={source.pageTree}>
				<DocsPage>
					<DocsTitle>Page not found</DocsTitle>
					<DocsBody>
						<a href='/docs'>Return to the guide</a>
					</DocsBody>
				</DocsPage>
			</DocsLayout>
		)
	const Content = page.data.body
	return (
		<DocsLayout {...layoutOptions} tree={source.pageTree}>
			<DocsPage toc={page.data.toc} tableOfContent={{ style: 'clerk' }}>
				<DocsTitle>{page.data.title}</DocsTitle>
				<DocsDescription>{page.data.description}</DocsDescription>
				<DocsBody id='content'>
					<Content components={defaultMdxComponents} />
				</DocsBody>
			</DocsPage>
		</DocsLayout>
	)
}
