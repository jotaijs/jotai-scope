import { atom } from 'jotai/vanilla'
import { loadable } from 'jotai/vanilla/utils'
import { createStore } from '../../../derivedStore'

describe('loadable', () => {
  it('should return fulfilled value of an already resolved async atom', async () => {
    const store = createStore()
    const asyncAtom = atom(Promise.resolve('concrete'))

    expect(await store.get(asyncAtom)).toEqual('concrete')
    expect(store.get(loadable(asyncAtom))).toEqual({
      state: 'loading',
    })
    await new Promise((r) => setTimeout(r)) // wait for a tick
    expect(store.get(loadable(asyncAtom))).toEqual({
      state: 'hasData',
      data: 'concrete',
    })
  })
})
