import { dirname, isAbsolute, join } from 'pathe'
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

async function fixEsmExport<T extends Record<string | symbol, any>>(contentsPromise: Promise<T>): T {
  const contents = await contentsPromise
  return contents?.default?.__esModule ? contents.default : contents
}

export class VitestBrowserClientMocker {
  private mockLoaders = new Map<string, () => any>()
  private cachedImports = new Map<string, Promise<any>>()
  private importUid = 1
  private mockActive = false

  constructor(
    private config: ResolvedConfig,
  ) {}

  public startTest() {
    this.mockActive = true
  }

  /**
   * Browser tests don't run in parallel, and can't really with immutable modules. This clears all
   * mocks after each run.
   */
  public resetAfterFile() {
    this.mockActive = false
    ++this.importUid
    this.mockLoaders.clear()
    this.resetModules()
  }

  public resetModules() {
    this.cachedImports.clear()
  }

  public async import(resolved: string | undefined, id: string, importer: string) {
    const out = this.resolvePath(id, importer)
    const alternativeResolved = out.resolved

    if (!this.mockActive)
      return fixEsmExport(import(resolved ?? alternativeResolved))

    if (resolved === undefined) {
      // this is something unresolvable or was a variable/expression now in `id`
      resolved = alternativeResolved
    }

    const prev = this.cachedImports.get(resolved)
    if (prev !== undefined)
      return prev

    const task = (async () => {
      const factory = this.mockLoaders.get(resolved) || this.mockLoaders.get(alternativeResolved)

      let contents
      if (factory)
        contents = await factory()

      else
        contents = await fixEsmExport(import(`${resolved}?test=${this.importUid}`))

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
    if (!this.mockActive)
      throw new Error(`Cannot queueMock outside test`)

    factory = factory || (() => {
      throw new Error('TODO: default mock behavior and import from __mocks__')
    })

    const { resolved } = this.resolvePath(id, importer)
    this.mockLoaders.set(resolved, factory)
    this.cachedImports.delete(resolved)
  }

  public queueUnmock(id: string, importer: string) {
    if (!this.mockActive)
      throw new Error(`Cannot queueUnmock outside test`)

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

    if (isAbsolute(resolved) && !resolved.startsWith('/@fs'))
      resolved = `/@fs${resolved}`

    // // remove config.project.root
    // const root = withTrailingSlash(this.config.root)
    // if (resolved.startsWith(root))
    //   resolved = resolved.slice(root.length - 1)

    return { resolved, importer }
  }

  private normalizeImporter(importer: string) {
    // importers arrive as the full URL or just their local path, normalize with URL
    const u = new URL(importer, `${location.protocol}//${location.host}`)
    importer = u.pathname + u.search

    // if (importer.startsWith('/@fs/'))
    //   importer = importer.slice(4)

    // const root = withTrailingSlash(this.config.root)
    // if (importer.startsWith(root))
    //   importer = importer.slice(root.length - 1)

    return importer
  }
}
