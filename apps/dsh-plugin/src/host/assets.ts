// Static art for the System window (generated locally with Qwen Image), served
// by DSH's own web server rather than inlined into the client bundle. The route
// is a resource so in-process reads (Desktop's app scheme) get it too. Only
// `/assets` under the package prefix is claimed: the prefix itself belongs to
// client-modules, which serves this package's client.js there.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { ASSET_ROUTE } from '../shared/remote.ts'

/** Every file the route will answer; anything else is a 404, so no path is ever resolved from the request. */
const FILES: Readonly<Record<string, string>> = { 'emblem.jpg': 'image/jpeg', 'awakening.jpg': 'image/jpeg' }

interface WebServer {
  register(route: { kind: 'prefix', path: string, resource: (request: Request) => Promise<Response> }): () => void
}

export function assetsPlugin() {
  // host.js sits at the package root next to assets/.
  const root = join(dirname(fileURLToPath(import.meta.url)), 'assets')
  return {
    name: 'reorigin-assets',
    inject: ['webServer'],
    apply(ctx: Context) {
      const server = (ctx as unknown as { webServer: WebServer }).webServer
      ctx.effect(() => server.register({
        kind: 'prefix',
        path: ASSET_ROUTE,
        async resource(request) {
          const name = new URL(request.url, 'http://local').pathname.slice(ASSET_ROUTE.length + 1)
          const type = FILES[name]
          if (type === undefined) return new Response('not found', { status: 404 })
          try {
            const body = await readFile(join(root, name))
            return new Response(request.method === 'HEAD' ? null : body, {
              headers: { 'content-type': type, 'content-length': String(body.length), 'cache-control': 'public, max-age=86400' },
            })
          } catch {
            return new Response('not found', { status: 404 })
          }
        },
      }), 'reorigin: asset route')
    },
  }
}
