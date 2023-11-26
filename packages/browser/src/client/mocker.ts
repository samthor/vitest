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
  private mocks = new Map<string, () => any>()

  constructor(
    private config: ResolvedConfig,
  ) {}

  public async import(loader: () => Promise<any>, id: string, importer: string) {
    const { resolved } = this.resolvePath(id, importer)

    const factory = this.mocks.get(resolved)

    if (factory)
      return factory()

    const all = await loader()
    return { ...all }
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

    this.mocks.set(resolved, factory)
  }

  public queueUnmock(id: string, _importer: string) {
    this.mocks.delete(id)
  }

  private resolvePath(rawId: string, importer: string) {
    if (isAbsolute(rawId))
      return { resolved: rawId }

    if (!rawId.match(/^\.{0,2}\//)) {
      try {
        // eslint-disable-next-line no-new
        new URL(rawId)
      }
      catch (error: any) {
        // found naked module specifier
        return { resolved: rawId }
      }
    }

    // __vitest_mocker__ gets http:// urls, queueMock gets paths
    const u = new URL(importer, `${location.protocol}//${location.host}`)

    // is this on our test url? if not, bail (e.g., external import)
    if (!(u.protocol === location.protocol && u.host === location.host))
      return { resolved: importer }

    importer = u.pathname

    // TODO: This is probably wrong; the goal is to move all URLs like "http://localhost:5173/src/whatever.js" to be their full on-disk path.
    // Instead this puts everything not in our root there, including e.g., random deps.
    // How do we match the 'fall-through' loads relative to the root?
    if (importer && !importer.startsWith(withTrailingSlash(this.config.root)))
      importer = join(this.config.root, importer)

    const dir = dirname(importer)
    const resolved = join(dir, rawId)
    return {
      resolved,
    }
  }
}
