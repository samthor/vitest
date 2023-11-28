import MagicString from 'magic-string'
import type { PluginContext } from 'rollup'
import type { Expression, ImportExpression } from 'estree'
import type { Positioned } from './esmWalker'
import { esmWalker } from './esmWalker'

// filter this out so getImporter() picks the right index
const skipImports = [
  '^vitest$',
  '^@vitest/',
]

export async function wrapImports(
  code: string,
  id: string,
  parse: PluginContext['parse'],
  resolve: PluginContext['resolve'],
) {
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

  const nodes: Positioned<ImportExpression>[] = []

  esmWalker(ast, {
    onDynamicImport(node) {
      // nodes.push(node)
      const expression = (node.source as Positioned<Expression>)

      let renderInner = s.slice(expression.start, expression.end)

      if (expression.type === 'Literal' && typeof expression.value === 'string') {
        const { value } = expression
        if (skipImports.some(i => value.match(i)))
          return

        // TODO: can't async here

        // console.info('import special', { resolved: resolve(value, id), id, value })

        // renderInner = JSON.stringify(resolve(value, id))
      }
      else {
      // TODO: maybe don't put side effects inside `import(...)` ?
        renderInner = s.slice(expression.start, expression.end)
      }

      s.overwrite(node.start, expression.start, '__vitest_mocker__.import(() => import(')
      s.overwrite(node.end - 1, node.end, `), ${renderInner}, import.meta.url)`)
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
