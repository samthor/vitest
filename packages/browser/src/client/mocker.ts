import { basename, dirname, isAbsolute, join, relative } from 'pathe'
import type { ResolvedConfig } from '../../../vitest/src/types/config'
import { buildFakeModule } from './fakeModule'

function throwNotImplemented(name: string) {
  throw new Error(`[vitest] ${name} is not implemented in browser environment yet.`)
}

// copy-paste from vite-node/utils
export function withTrailingSlash(path: string): string {
  if (path[path.length - 1] !== '/')
    return `${path}/`

  return path
}

export class VitestBrowserClientMocker {
  private mockLoaders = new Map<string, () => any>()
  private cachedImports = new Map<string, Promise<any>>()
  private importUid = 1

  constructor(
    private config: ResolvedConfig,
  ) {}

  /**
   * Browser tests don't run in parallel, and can't really with immutable modules. This clears all
   * mocks after each run.
   */
  public resetAfterFile() {
    console.warn('$$$ RESET ALL MOCKS')
    this.mockLoaders.clear()
    this.cachedImports.clear()
    ++this.importUid
  }

  public resetModules() {
    this.cachedImports.clear()
  }

  public async import(loader: (uid: any) => Promise<any>, id: string, importer: string): Promise<Record<string | symbol, any>> {
    const { resolved } = this.resolvePath(id, importer)

    // FIXME:
    //  - The issue is that subordinate mods already have a ref to whatever's returned here
    // e.g.
    // Test file imports A, comes here. Calls the import() loader, stores ref to B.
    // B is from a previous test invocation. It has **already run**.
    //
    // Solutions - magic ID on imports, new every time. Awkward to manipulate Vite/Rollup import paths.
    //

    const prev = this.cachedImports.get(resolved)
    if (prev !== undefined)
      return prev

    const task = (async () => {
      const factory = this.mockLoaders.get(resolved)
      let contents
      if (factory)
        contents = factory()
      else
        contents = loader(this.importUid)

      return buildFakeModule(contents)
    })()
    this.cachedImports.set(resolved, task)
    return task
  }

  public importActual() {
    throwNotImplemented('importActual')
  }

  public importMock() {
    throwNotImplemented('importMock')
  }

  public queueMock(id: string, importer: string, factory?: () => any) {
    factory = factory || (() => {
      throw new Error('TODO: default mock behavior and import from __mocks__')
    })

    const { resolved } = this.resolvePath(id, importer)
    console.warn('! TODO: queueMock - this is run on file _load_, not run', { id, importer, resolved })
    this.mockLoaders.set(resolved, factory)
    this.cachedImports.delete(resolved)
  }

  public queueUnmock(id: string, importer: string) {
    const { resolved } = this.resolvePath(id, importer)
    this.mockLoaders.delete(resolved)
  }

  private resolvePath(rawId: string, importer: string) {
    importer = this.normalizeImporter(importer)

    if (isAbsolute(rawId))
      return { resolved: rawId, importer }

    if (!/^\.{0,2}\//.test(rawId)) {
      try {
        const u = new URL(rawId)
        if (!(u.protocol === location.protocol && u.host === location.host)) {
          // e.g. "https://" or "node:" but not our own test domain, don't resolve further
          return {
            resolved: rawId,
            importer,
          }
        }

        rawId = u.pathname
      }
      catch (error: any) {
        // can't construct URL, found naked module specifier
        return { resolved: rawId, importer }
      }
    }

    let resolved = join(dirname(importer), rawId)

    // remove config.project.root
    const root = withTrailingSlash(this.config.root)
    if (resolved.startsWith(root))
      resolved = resolved.slice(root.length - 1)

    return { resolved, importer }
  }

  private normalizeImporter(importer: string) {
    // importers arrive as the full URL or just their local path, normalize with URL
    const u = new URL(importer, `${location.protocol}//${location.host}`)
    importer = u.pathname + u.search

    if (importer.startsWith('/@fs/'))
      importer = importer.slice(4)

    const root = withTrailingSlash(this.config.root)
    if (importer.startsWith(root))
      importer = importer.slice(root.length - 1)

    return importer
  }
}
