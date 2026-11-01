// Build the installable DSH bundle into dist/:
//   host.js           ESM for the Host Loader; our packages and zod are inlined,
//                     DSH packages and node: builtins stay external (peers).
//   client.js         DSH's `window.__ModuleLoader__.load({ id, factory })`
//                     closure around a CJS bundle; externals resolve through the
//                     loader's `require`, which only answers DSH's platform
//                     module table (react, react/jsx-runtime, ...).
//   package.json      dsh.bundle + dsh.client manifest.
//   cordis.patch.yml  the Loader row.
// DSH builds its own client bundles with an unpublished tsdown preset
// (packages/client/tsdown.client.ts); this reproduces only the subset we use:
// no CSS modules, no assets, no split chunks.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const PACKAGE_NAME = 'dsh-plugin-reorigin'
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }

/** Must stay within DSH's PLATFORM_MODULES (packages/client/web/src/platform.ts at the pinned commit). */
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis']

rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

await build({
  entryPoints: [join(ROOT, 'src/host/index.ts')],
  outfile: join(DIST, 'host.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*', 'node:*'],
  legalComments: 'none',
  logLevel: 'warning',
})

const client = await build({
  entryPoints: [join(ROOT, 'src/client/index.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: CLIENT_EXTERNALS,
  legalComments: 'none',
  logLevel: 'warning',
})
const body = client.outputFiles[0]!.text
const unexpected = [...body.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]!).filter(id => !CLIENT_EXTERNALS.includes(id))
if (unexpected.length > 0) throw new Error(`client bundle requires modules DSH does not share: ${[...new Set(unexpected)].join(', ')}`)
writeFileSync(join(DIST, 'client.js'), [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  body,
  'return module.exports; } });',
  '',
].join('\n'))

writeFileSync(join(DIST, 'package.json'), `${JSON.stringify({
  name: PACKAGE_NAME,
  version,
  description: 'Re:Origin — a real-world growth System inside DeepSeek Harness',
  type: 'module',
  main: 'host.js',
  exports: { '.': './host.js', './client': './client.js', './package.json': './package.json' },
  files: ['host.js', 'client.js', 'cordis.patch.yml', 'assets'],
  peerDependencies: { '@deepseek-ai/cordis': '*', '@deepseek-ai/dsh-tools': '*', '@deepseek-ai/dsh-typert-protocol': '*' },
  engines: { dsh: '>=0.2.1-rc.5 <0.3.0' },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      platform: 'web',
      inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-sidebar'],
    },
  },
}, null, 2)}\n`)

cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true })
writeFileSync(join(DIST, 'cordis.patch.yml'), `- insert:\n    - id: reorigin\n      name: ${PACKAGE_NAME}\n`)

console.log(`built ${PACKAGE_NAME}@${version} → ${DIST}`)

// --pack: an npm tarball under release/, installable with `dsh plugin add ./<file>.tgz`
// or the Plugins page, without linking a checkout or running any build on install.
if (process.argv.includes('--pack')) {
  const release = join(ROOT, 'release')
  mkdirSync(release, { recursive: true })
  const file = execFileSync('npm', ['pack', '--silent', '--pack-destination', release], { cwd: DIST, encoding: 'utf8' }).trim()
  console.log(`packed → ${join(release, file)}`)
}
