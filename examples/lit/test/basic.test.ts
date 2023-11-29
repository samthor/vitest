import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import * as helperLib from '../src/helper.js'

// side-effects only: registers CE
import '../src/my-button.js'
import '../src/side-effects.js'

vi.mock('../src/helper.js', () => {
  return {
    helper: () => 'Mock value',
  }
})

describe('Button with increment', async () => {
  function getInsideButton(): HTMLElement | null | undefined {
    return document.body.querySelector('my-button')?.shadowRoot?.querySelector('button')
  }

  let node: HTMLElement

  beforeEach(() => {
    node = document.createElement('div')
    node.innerHTML = '<my-button name="World"></my-button>'
    document.body.append(node)
  })

  afterEach(() => {
    node.remove()
  })

  test('spyOn works on ESM', async () => {
    vi.spyOn(helperLib, 'helper').mockReturnValue('mocked')
    expect(helperLib.helper()).toBe('mocked')
    vi.mocked(helperLib.helper).mockRestore()
  })

  test('direct mock', async () => {
    expect(helperLib.helper()).toBe('Mock value')
  })

  it('should let us mock a value used within lit', async () => {
    const x = await import('../src/helper.js')
    expect(x.helper()).toContain(`Mock value`)
  })

  it('should increment the count on each click', () => {
    getInsideButton()?.click()
    expect(getInsideButton()?.textContent).toContain('1')
  })

  it('should show name props', () => {
    getInsideButton()
    expect(document.body.querySelector('my-button')?.shadowRoot?.innerHTML).toContain('World')
  })

  it('should dispatch count event on button click', () => {
    const spyClick = vi.fn()

    document.querySelector('my-button')!.addEventListener('count', spyClick)

    getInsideButton()?.click()

    expect(spyClick).toHaveBeenCalled()
  })

  it('should have a helper value', () => {
    const el = document.body.querySelector('my-button')?.shadowRoot?.getElementById('helper')
    expect(el?.textContent).toContain(`Mock value`)
  })
})
