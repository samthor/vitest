import { fileURLToPath } from 'node:url'

import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import sirv from 'sirv'
import type { Plugin } from 'vite'
import type { WorkspaceProject } from 'vitest/node'
import { injectVitestModule } from './esmInjector'
import { wrapImports } from './wrapImports'

export default (project: WorkspaceProject, base = '/'): Plugin[] => {
  const pkgRoot = resolve(fileURLToPath(import.meta.url), '../..')
  const distRoot = resolve(pkgRoot, 'dist')

  return [
    {
      name: 'vitest:browser:dynamic-import-test',
      enforce: 'pre',
      renderDynamicImport({ targetModuleId }) {
        const replaceImportMock = project.config.browser.replaceImportMock ?? false
        console.warn('renderDynamicImport', { targetModuleId, replaceImportMock })
        if (!replaceImportMock)
          return

        return {
          left: '__vitest_mocker__.magic(',
          right: `, ${JSON.stringify(targetModuleId)} import.meta.url)`,
        }
      },
    },
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
  ]
}

// TODO: awkward way to put plugins at end of server.ts
export function after(project: WorkspaceProject): Plugin[] {
  return [
    {
      name: 'vitest:browser:wrap-imports',
      enforce: 'post',
      transform(source, id) {
        const replaceImportMock = project.config.browser.replaceImportMock ?? false
        if (!replaceImportMock)
          return
        return wrapImports(source, id, this.parse, this.resolve.bind(this))
      },
    },
  ]
}
