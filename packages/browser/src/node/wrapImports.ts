import MagicString from 'magic-string'
import type { PluginContext } from 'rollup'
import type { Expression } from 'estree'
import type { Positioned } from './esmWalker'
import { esmWalker } from './esmWalker'

export function wrapImports(code: string, id: string, parse: PluginContext['parse']) {
  const s = new MagicString(code)

  let ast: any
  try {
    ast = parse(code)
  }
  catch (err) {
    console.error(`Cannot parse ${id}:\n${(err as any).message}`)
    return
  }

  // TODO: rewrite reexports (doesn't consider mocks)

  // convert references to dynamic imports (already all dynamic from hoistMocks)
  esmWalker(ast, {
    onDynamicImport(node) {
      const expression = (node.source as Positioned<Expression>)

      // TODO: maybe don't put side effects inside `import(...)` ?
      const inner = s.slice(expression.start, expression.end)

      s.overwrite(node.start, expression.start, '__vitest_mocker__.import(() => import(')
      s.overwrite(node.end - 1, node.end, `), ${inner}, import.meta.url)`)
    },
    onIdentifier() {},
    onImportMeta() {},
  })

  return {
    ast,
    code: s.toString(),
    map: s.generateMap({ hires: 'boundary', source: id }),
  }
}
