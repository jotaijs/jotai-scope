import { atom } from '../atom'
import type { PrimitiveAtom } from '../atom'

export function atomWithLazy<Value>(
  makeInitial: () => Value,
): PrimitiveAtom<Value> {
  const a = atom(undefined as unknown as Value)
  delete (a as { init?: Value }).init
  Object.defineProperty(a, 'init', {
    get() {
      return makeInitial()
    },
  })
  return a
}
