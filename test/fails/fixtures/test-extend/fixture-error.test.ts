import { afterEach, beforeEach, describe, expectTypeOf, test, expect } from 'vitest'

describe('error thrown in beforeEach fixtures', () => {
  const myTest = test.extend<{ a: never }>({
    a: async () => {
      throw new Error('Error thrown in beforeEach fixture')
    },
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  beforeEach<{ a: never }>(({ a }) => {})

  myTest('error is handled', () => {})
})

describe('error thrown in afterEach fixtures', () => {
  const myTest = test.extend<{ a: never }>({
    a: async () => {
      throw new Error('Error thrown in afterEach fixture')
    },
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  afterEach<{ a: never }>(({ a }) => {})

  myTest('fixture errors', () => {
    expectTypeOf(1).toEqualTypeOf<number>()
  })
})

describe('error thrown in test fixtures', () => {
  const myTest = test.extend<{ a: never }>({
    a: async () => {
      throw new Error('Error thrown in test fixture')
    },
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  myTest('fixture errors', ({ a }) => {})
})

describe('correctly fails when test times out', () => {
  const myTest = test.extend<{ a: number }>({
    a: async ({}, use) => {
      await use(2)
    },
  })
  myTest('test times out', async ({ a }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(a).toBe(2)
  }, 20)
})
