import { dirname, isAbsolute, join } from 'pathe'
import type { ResolvedConfig } from '../../../vitest/src/types/config'

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

  constructor(
    private config: ResolvedConfig,
  ) {}

  /**
   * Browser tests don't run in parallel, and can't really with immutable modules. This clears all
   * mocks after each run.
   */
  public resetAfterFile() {
    this.mockLoaders.clear()
    this.cachedImports.clear()
  }

  public resetModules() {
    this.cachedImports.clear()
  }

  /**
   * The magic method that imports are rewritten to. This resolves the path,
   */
  public async import(loader: () => Promise<any>, id: string, importer: string) {
    const { resolved } = this.resolvePath(id, importer)

    const prev = this.cachedImports.get(resolved)
    if (prev !== undefined)
      return prev

    const task = (async () => {
      const factory = this.mockLoaders.get(resolved)
      if (factory)
        return factory()

      const all = await loader()
      return { [Symbol.toStringTag]: 'Module', ...all }
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
    this.mockLoaders.set(resolved, factory)
  }

  public queueUnmock(id: string, importer: string) {
    const { resolved } = this.resolvePath(id, importer)
    this.mockLoaders.delete(resolved)
  }

  private resolvePath(rawId: string, importer: string) {
    importer = this.normalizeImporter(importer)

    if (isAbsolute(rawId))
      return { resolved: rawId, importer }

    if (!rawId.match(/^\.{0,2}\//)) {
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

    const resolved = join(dirname(importer), rawId)
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
