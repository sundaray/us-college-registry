/// <reference types="vite/client" />

import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { BackToTop } from '@/components/back-to-top'
import { NotFoundPage } from '@/components/not-found-page'
import { SearchProvider } from '@/components/search/search-provider'
import { GA_MEASUREMENT_ID, SITE_ORIGIN } from '@/lib/site'
import { SITE_NAME } from '@/lib/site-copy'
import appCss from '../styles/app.css?url'

// Google's tag (gtag.js) for Google Analytics, with one change: it only runs on
// the site's own address. `pnpm dev`, other stages on workers.dev, and the
// preview server where `pnpm bucket` and `pnpm verify-site` open every page
// send no page views and never request Google's script. The script is added
// from here, not as a second tag, so those places don't download it either.
// RootDocument renders it with ScriptOnce, so it runs once per page load. As
// an entry in the head's `scripts`, the router inserted it again on every link
// click, and each run repeated the setup and loaded Google's script again.
const GOOGLE_TAG_SCRIPT = `if (location.hostname === '${new URL(SITE_ORIGIN).hostname}') {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', '${GA_MEASUREMENT_ID}');
  var googleTag = document.createElement('script');
  googleTag.async = true;
  googleTag.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
  document.head.appendChild(googleTag);
}`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: `${SITE_NAME.start} ${SITE_NAME.end}` },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  return (
    <RootDocument>
      {/* Every page's Search button opens the one search dialog. */}
      <SearchProvider>
        <Outlet />
      </SearchProvider>
      <BackToTop />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <ScriptOnce children={GOOGLE_TAG_SCRIPT} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

