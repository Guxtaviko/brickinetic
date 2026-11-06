import { RootProvider } from 'fumadocs-ui/provider/react-router'
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import '@fontsource-variable/geist/index.css'
import '../styles/globals.css'

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang='en' suppressHydrationWarning data-type='software'>
			<head>
				<meta charSet='utf-8' />
				<meta name='viewport' content='width=device-width, initial-scale=1' />
				<meta name='page-type' content='software' />
				<meta name='site-kind' content='software' />
				<Meta />
				<Links />
			</head>
			<body className='m-0 bg-fd-background font-body text-fd-foreground'>
				<a href='#content' className='sr-only focus:not-sr-only'>
					Skip to content
				</a>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}
export default function Root() {
	return (
		<RootProvider search={{ options: { type: 'static', api: '/api/search' } }}>
			<Outlet />
		</RootProvider>
	)
}
