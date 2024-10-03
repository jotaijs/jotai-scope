import { atomWithLazy } from 'jotai/vanilla/utils'
import { createStore } from '../../../derivedStore'

it('initializes on first store get', async () => {
  const storeA = createStore()
  const storeB = createStore()

  let externalState = 'first'
  const initializer = jest.fn(() => externalState)
  const anAtom = atomWithLazy(initializer)

  expect(initializer).not.toHaveBeenCalled()
  expect(storeA.get(anAtom)).toEqual('first')
  expect(initializer).toHaveBeenCalledTimes(1)

  externalState = 'second'

  expect(storeA.get(anAtom)).toEqual('first')
  expect(initializer).toHaveBeenCalledTimes(1)
  expect(storeB.get(anAtom)).toEqual('second')
  expect(initializer).toHaveBeenCalledTimes(2)
})

it('is writable', async () => {
  const store = createStore()
  const anAtom = atomWithLazy(() => 0)

  store.set(anAtom, 123)

  expect(store.get(anAtom)).toEqual(123)
})

it('should work with a set state action', async () => {
  const store = createStore()
  const anAtom = atomWithLazy(() => 4)

  store.set(anAtom, (prev: number) => prev * prev)

  expect(store.get(anAtom)).toEqual(16)
})
