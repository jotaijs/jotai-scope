import { useCallback } from 'react'
import type { WritableAtom } from './atom'
import { useStore } from './Provider'
import type { ExtractAtomArgs, ExtractAtomResult } from './typeUtils'

type SetAtom<Args extends unknown[], Result> = (...args: Args) => Result
type Options = Parameters<typeof useStore>[0]

export function useSetAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options?: Options
): SetAtom<Args, Result>

export function useSetAtom<
  AtomType extends WritableAtom<unknown, never[], unknown>,
>(
  atom: AtomType,
  options?: Options
): SetAtom<ExtractAtomArgs<AtomType>, ExtractAtomResult<AtomType>>

export function useSetAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options?: Options
) {
  const store = useStore(options)
  const setAtom = useCallback(
    (...args: Args) => {
      if (process.env?.MODE !== 'production' && !('write' in atom)) {
        // useAtom can pass non writable atom with wrong type assertion,
        // so we should check here.
        throw new Error('not writable atom')
      }
      return store.set(atom, ...args)
    },
    [store, atom]
  )
  return setAtom
}
