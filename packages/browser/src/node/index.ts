import { fileURLToPath } from 'node:url'

import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import sirv from 'sirv'
import type { Plugin } from 'vite'
import type { WorkspaceProject } from 'vitest/node'
import { injectVitestModule } from './esmInjector'
import { insertEsmProxy } from './esmProxy'

export default (existingPlugins: Plugin[], project: WorkspaceProject, base = '/'): Plugin[] => {
  const pkgRoot = resolve(fileURLToPath(import.meta.url), '../..')
  const distRoot = resolve(pkgRoot, 'dist')

  return [
    {
      enforce: 'pre',
      name: 'vitest:browser',
      async config(viteConfig) {
        // Enables using ignore hint for coverage providers with @preserve keyword
        if (viteConfig.esbuild !== false) {
          viteConfig.esbuild ||= {}
          viteConfig.esbuild.legalComments = 'inline'
        }
      },
      async configureServer(server) {
        server.middlewares.use(
          base,
          sirv(resolve(distRoot, 'client'), {
            single: false,
            dev: true,
          }),
        )
      },
    },
    {
      name: 'vitest:browser:tests',
      enforce: 'pre',
      async config() {
        const {
          include,
          exclude,
          includeSource,
          dir,
          root,
        } = project.config
        const projectRoot = dir || root
        const entries = await project.globAllTestFiles(include, exclude, includeSource, projectRoot)
        return {
          optimizeDeps: {
            entries: [
              ...entries,
              'vitest/utils',
              'vitest/browser',
              'vitest/runners',
            ],
            exclude: [
              ...builtinModules,
              'vitest',
              'vitest/utils',
              'vitest/browser',
              'vitest/runners',
              '@vitest/utils',
            ],
            include: [
              'vitest > @vitest/utils > pretty-format',
              'vitest > @vitest/snapshot > pretty-format',
              'vitest > diff-sequences',
              'vitest > loupe',
              'vitest > pretty-format',
              'vitest > pretty-format > ansi-styles',
              'vitest > pretty-format > ansi-regex',
              'vitest > chai',
            ],
          },
        }
      },
      async resolveId(id) {
        if (!/\?browserv=\w+$/.test(id))
          return

        let useId = id.slice(0, id.lastIndexOf('?'))
        if (useId.startsWith('/@fs/'))
          useId = useId.slice(5)

        if (/^\w:/.test(useId))
          useId = useId.replace(/\\/g, '/')

        return useId
      },
    },
    // {
    //   name: 'vitest:browser:isolate-tests',
    //   enforce: 'pre',
    //   async resolveId(id, importer, options) {
    //     if (importer?.startsWith('/@test/')) {
    //       console.debug('got importer', { id, importer })
    //       // TODO

    //       const testId = importer.slice(7).split('~', 1)[0]
    //       return `/@test/${testId}~${id}`
    //     }

    //     if (!id.startsWith('/@test/'))
    //       return

    //     // match /@test/<testId>~<import>
    //     let useId = id.slice(7)
    //     const testId = useId.split('~', 1)[0]
    //     useId = useId.slice(testId.length + 1)

    //     console.debug('got @test prefixed', { testId, useId, id, importer, options })

    //     return id // still use this to load
    //   },
    //   // async load(id) {
    //   //   if (!id.startsWith('/@test/'))
    //   //     return undefined

    //   //   let useId = id.slice(7)
    //   //   const testId = useId.split('~', 1)[0]
    //   //   useId = useId.slice(testId.length + 1)
    //   //   console.debug('load direct', { id, useId })

    //   //   const internalLoad = await this.load({ id: useId })
    //   //   console.debug('got load', internalLoad)
    //   //   return { ast: internalLoad.ast!, code: '' }
    //   //   // return {
    //   //   //   code: internalLoad.code,
    //   //   // }
    //   // },
    // },
    {
      name: 'vitest:browser:esm-injector',
      enforce: 'post',
      transform(source, id) {
        const hijackESM = project.config.browser.slowHijackESM ?? false
        if (!hijackESM)
          return
        return injectVitestModule(source, id, this.parse)
      },
    },

    // MocksPlugin needs to be placed here for proxyHijackESM to work
    ...existingPlugins,

    {
      name: 'vitest:browser:esm-proxy',
      enforce: 'post',
      async transform(source, id) {
        const proxyHijackESM = project.config.browser.proxyHijackESM ?? false
        if (!proxyHijackESM)
          return
        return insertEsmProxy(source, id, this.parse, this.resolve.bind(this))
      },
    },
  ]
}
