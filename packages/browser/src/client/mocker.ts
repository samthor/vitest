import type { ResolvedConfig } from 'vitest'
import { resolve } from 'pathe'
import type { PendingSuiteMock } from 'vitest/src/types/mocker.js'
import { buildFakeModule } from './fakeModule'
import { rpc } from './rpc'

function extractStringImport(fn: Function) {
  const s = String(fn)

  const re = /import\((.*?)\)/
  const m = re.exec(s)

  if (!m)
    return

  const rawValue = m[1]

  try {
    if (rawValue.startsWith('"'))
      return JSON.parse(rawValue)

    if (rawValue.startsWith('\''))
      // this is e.g., 'foo\'b"ar' because of double-quotes in import
      // TODO: avoid eval?
      // eslint-disable-next-line no-eval
      return (0, eval)(rawValue)
  }
  catch {}
}

export class VitestBrowserClientMocker {
  constructor(public config: ResolvedConfig) {}

  private wrappedImports = new WeakMap<any, any>()
  private mockLoaders = new Map<string, () => any>()

  private pendingMocks: PendingSuiteMock[] = []

  /**
   * Browser tests don't run in parallel. This clears all mocks after each run.
   */
  public resetAfterFile() {
    this.resetModules()
  }

  public resetModules() {
    this.wrappedImports = new WeakMap()
  }

  private async resolveId(id: string, importer: string): Promise<string | undefined> {
    const resolved = await rpc().resolveId(id, importer)
    if (!resolved)
      return

    const root = resolve(this.config.root)
    const rootWithSlash = `${root}/`

    if (resolved.id.startsWith(rootWithSlash))
      return resolved.id.substring(root.length)
    return resolved.id
  }

  private async processPendingMock(p: PendingSuiteMock) {
    const resolved = await this.resolveId(p.id, p.importer)
    const id = resolved ?? p.id // allows mocking external moduels (e.g., import uninstalled "vscode")

    if (p.type === 'unmock') {
      this.mockLoaders.delete(id)
      return
    }

    let promise: any
    this.mockLoaders.set(id, async () => {
      // TODO: this should report helpful errors like `callFunctionMock` sets up inside the Node mocker
      if (!promise)
        promise = Promise.resolve(p.factory!())
      return promise
    })
  }

  private pendingPromise: Promise<void> | undefined

  private async processAllPendingMocks() {
    // someone else is processing mocks, wait for them
    if (this.pendingPromise || this.pendingMocks.length === 0)
      return this.pendingPromise

    // process all pending mocks in a block as wrap() might be called simultaneously
    this.pendingPromise = (async () => {
      while (this.pendingMocks.length) {
        const next = this.pendingMocks.shift()!
        await this.processPendingMock(next)
      }
      this.pendingPromise = undefined
    })()

    return this.pendingPromise
  }

  // entrypoint configured by esmProxy.ts: this is passed a callback like "() => import('...')"
  public async wrap(fn: () => Promise<any>) {
    if (!this.config.browser.proxyHijackESM)
      throw new Error(`hijackESM disabled but mocker invoked`)

    await this.processAllPendingMocks()

    const extractResolvedId = extractStringImport(fn)
    const loader = this.mockLoaders.get(extractResolvedId)

    const module = loader ? await loader() : await fn()

    let wrapped = this.wrappedImports.get(module)
    if (wrapped === undefined) {
      wrapped = buildFakeModule(module)
      this.wrappedImports.set(module, wrapped)
    }
    return wrapped
  }

  public async importActual<T>(rawId: string, importer: string): Promise<T> {
    const resolved = await this.resolveId(rawId, importer)

    if (!resolved)
      throw new Error(`[vitest] could not resolve for importActual: ${rawId}`)

    return import(resolved) as Promise<T>
  }

  public importMock() {
    throw new Error(`[vitest] importMock is not implemented in browser environment yet.`)
  }

  public queueMock(id: string, importer: string, factory?: () => any) {
    if (!this.config.browser.isolate || !this.config.browser.proxyHijackESM)
      throw new Error(`[vitest] mocking in the browser environment is currently only supported with proxyHijackESM=true and isolate=true`)

    if (!factory)
      throw new Error(`[vitest] factory function is required for mocks in the browser environment`)

    this.pendingMocks.push({ id, importer, factory, type: 'mock' })
  }

  public queueUnmock(id: string, importer: string) {
    this.pendingMocks.push({ id, importer, type: 'unmock' })
  }

  public prepare() {
    // TODO: prepare
  }
}
