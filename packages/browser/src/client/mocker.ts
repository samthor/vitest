import { dirname, isAbsolute, join, resolve } from 'pathe'
import { withTrailingSlash } from 'vite-node/utils'
import type { ResolvedConfig } from '../../../vitest/src/types/config'

function throwNotImplemented(name: string) {
  throw new Error(`[vitest] ${name} is not implemented in browser environment yet.`)
}

export class VitestBrowserClientMocker {
  private mocks = new Map<string, () => any>()

  constructor(
    private config: ResolvedConfig,
  ) {}

  public async import(loader: () => Promise<any>, id: string, importer: string) {
    const { resolved } = this.resolvePath(id, importer)

    const factory = this.mocks.get(resolved)

    // eslint-disable-next-line no-console
    console.info('!!! import', { resolved, id, importer, factory })

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
      throw new Error('TODO: default mock behavior')
    })

    const { resolved } = this.resolvePath(id, importer)

    // eslint-disable-next-line no-console
    console.info('!!! queueMock', { resolved, id, importer, factory })

    this.mocks.set(resolved, factory)
  }

  public queueUnmock(id: string, _importer: string) {
    this.mocks.delete(id)
  }

  private resolvePath(rawId: string, importer: string) {
    if (isAbsolute(rawId))
      return { resolved: rawId }

    if (importer && !importer.startsWith(withTrailingSlash(this.config.root)))
      importer = resolve(this.config.root, importer)

    // __vitest_mocker__ gets http:// urls, queueMock gets paths
    const u = new URL(importer, 'file://')
    const { pathname } = u
    const dir = dirname(pathname)
    const resolved = join(dir, rawId)
    return {
      resolved,
    }
  }
}
