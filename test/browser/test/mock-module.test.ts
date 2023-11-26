import { expect, test, vi } from 'vitest'
import { calculator } from '../src/calculator'

vi.mock('../src/actions', () => {
  return {
    plus: (a: number, b: number) => {
      return a * b
    },
  }
})

test('can mock indirect module', () => {
  expect(calculator('plus', 2, 4)).toBe(8)
})
