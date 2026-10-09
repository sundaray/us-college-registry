import * as Alchemy from 'alchemy'
import { adopt } from 'alchemy/AdoptPolicy'
import * as Cloudflare from 'alchemy/Cloudflare'
import { Stack } from 'alchemy/Stack'
import * as Effect from 'effect/Effect'
import { SITE_ORIGIN } from './src/lib/site.ts'

const SITE_HOSTNAME = new URL(SITE_ORIGIN).hostname

// `pnpm build` prebuilds every page as a static file (see vite.config.ts), so the
// site deploys as an assets-only Worker. No Worker code is uploaded, and
// Cloudflare serves every request from its asset layer.
export const Website = Cloudflare.Website.StaticSite(
  'Website',
  Stack.useSync((stack) => {
    const isProd = stack.stage === 'prod'
    return {
      // Other stages get a name Alchemy derives from the stack, stage, and ID.
      name: isProd ? 'us-college-registry' : undefined,
      // Only prod serves the domain. www gets a 301 to it from a Cloudflare
      // redirect rule that runs before the Worker, keeping the path and query.
      domain: isProd ? { name: SITE_HOSTNAME, redirects: [`www.${SITE_HOSTNAME}`] } : undefined,
      // Prod has no workers.dev address, so each page has one address for
      // search engines. Other stages stay on workers.dev.
      workersDev: !isProd,
      command: 'pnpm build',
      outdir: 'dist/client',
      // Build on every deploy (about a minute). Alchemy's check for unchanged files
      // opens every input and output file at once, and the ~26,000 page data files
      // plus ~48,000 built files go past macOS's limit of 61,440 open files.
      memo: false,
      assets: {
        // Pages are written as /schools/x.html and served at /schools/x, with no
        // trailing slash.
        htmlHandling: 'drop-trailing-slash',
      },
    }
  }),
)

export default Alchemy.Stack(
  'us-college-registry',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stack = yield* Stack
    const website = yield* Website
    if (stack.stage === 'prod') {
      // The zone was made when the domain was bought on Cloudflare, so it is
      // adopted rather than created. Alchemy keeps zones when a stack is destroyed.
      const zone = yield* Cloudflare.Zone.Zone('Zone', { name: SITE_HOSTNAME }).pipe(adopt(true))
      // Answers http:// requests with a redirect to https://.
      yield* Cloudflare.Zone.Setting('AlwaysUseHttps', {
        zoneId: zone.zoneId,
        settingId: 'always_use_https',
        value: 'on',
      })
    }
    return {
      url: website.url.as<string>(),
    }
  }),
)
