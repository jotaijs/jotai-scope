import type { JSX, ReactNode } from 'react'
import { useState } from 'react'
import { Provider, useStore } from '../../jotai'
import type { Atom } from '../../jotai'
import { createScope } from './scope'
import type { AnyAtom, AnyAtomFamily, Store } from './types'
import { isEqualSet } from './utils'

type BaseScopeProviderProps = {
  atoms?: Iterable<AnyAtom>
  atomFamilies?: Iterable<AnyAtomFamily>
  debugName?: string
  store?: Store
  children: ReactNode
}

export function ScopeProvider(
  props: { atoms: Iterable<Atom<unknown>> } & BaseScopeProviderProps
): JSX.Element

export function ScopeProvider(
  props: { atomFamilies: Iterable<AnyAtomFamily> } & BaseScopeProviderProps
): JSX.Element

export function ScopeProvider(props: BaseScopeProviderProps) {
  const { atoms, atomFamilies, children, debugName, ...options } = props
  const baseStore = useStore(options)
  const atomSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)

  function initialize() {
    return {
      scope: createScope(atomSet, atomFamilySet, baseStore, debugName),
      hasChanged(current: {
        baseStore: Store
        atomSet: Set<Atom<unknown>>
        atomFamilySet: Set<AnyAtomFamily>
      }) {
        return (
          current.baseStore !== baseStore ||
          !isEqualSet(atomSet, current.atomSet) ||
          !isEqualSet(atomFamilySet, current.atomFamilySet)
        )
      },
    }
  }

  const [{ hasChanged, scope }, setState] = useState(initialize)
  if (hasChanged({ baseStore, atomSet, atomFamilySet })) {
    scope.cleanup()
    setState(initialize)
  }
  return <Provider store={scope.store}>{children}</Provider>
}
