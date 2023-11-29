import { expect, test, vi } from 'vitest'
import { calculator } from '../src/calculator'

vi.hoisted(() => {
  vi.resetModules()
})

vi.mock('../src/actions', () => {
  return {
    plus: (a, b) => a * b,
  }
})

test('can mock indirect module', () => {
  expect(calculator('plus', 2, 4)).toBe(8)
})

test('can mock fake module', async () => {
  // can't inline in import(), vite freaks out
  const importName = `fake-does-not-exist-${Math.random()}`

  let imported
  try {
    imported = await import(importName)
  }
  catch (e) {}
  expect(imported).toBe(undefined)

  // module import is cached
  vi.resetModules()

  // this doesn't exist in the browser
  vi.doMock(importName, () => {
    return {
      '.hello': 'there',
    }
  })

  const fs = await import(importName)
  expect(fs['.hello']).toBe('there')
})
