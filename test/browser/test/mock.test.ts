import { expect, test, vi } from 'vitest'
import { calculator } from '../src/calculator'

vi.mock('../src/fake', () => {
  return { default: 2 }
})

vi.mock('../src/actions', () => {
  return {
    plus(a: number, b: number) {
      return a * b
    },
  }
})

test('top-level mock', async () => {
  expect((await import('../src/fake')).default).toBe(2)
})

test('dynamic mock', async () => {
  vi.doMock('../src/fake', () => {
    return { default: 3 }
  })
  expect((await import('../src/fake')).default).toBe(3)
})

test('mock nested', async () => {
  expect(calculator('plus', 4, 4)).toBe(16)

  // expect spy on proxy to work
  const actions = await import('../src/actions')
  vi.spyOn(actions, 'plus').mockReturnValue(-100)
  expect(calculator('plus', 4, 40)).toBe(-100)
})
