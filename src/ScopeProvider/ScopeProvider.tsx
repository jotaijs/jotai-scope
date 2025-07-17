import {
  type PropsWithChildren,
  createElement,
  useEffect,
  useState,
} from 'react'
import { Provider, useStore } from 'jotai/react'
import { useHydrateAtoms } from 'jotai/utils'
import {
  type AnyAtom,
  type AnyAtomFamily,
  type AtomDefault,
  SCOPE,
  ScopedStore,
  type Store,
} from '../types'
import { isEqualSet } from '../utils'
import { createScope } from './scope'

type ScopeProviderBaseProps = PropsWithChildren<{
  atoms?: Iterable<AnyAtom | AtomDefault>
  atomFamilies?: Iterable<AnyAtomFamily>
  debugName?: string
  store?: ScopedStore
}>

export function ScopeProvider(
  props: {
    atoms: Iterable<AnyAtom | AtomDefault>
  } & ScopeProviderBaseProps
): React.JSX.Element

export function ScopeProvider(
  props: {
    atomFamilies: Iterable<AnyAtomFamily>
  } & ScopeProviderBaseProps
): React.JSX.Element

export function ScopeProvider({
  atoms: atomsOrTuples = [],
  atomFamilies,
  children,
  debugName: scopeName,
  store,
}: ScopeProviderBaseProps) {
  const parentStore: Store | ScopedStore = useStore()

  const atoms = Array.from(atomsOrTuples, (a) => (Array.isArray(a) ? a[0] : a))

  // atomSet is used to detect if the atoms prop has changed.
  const atomSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)

  function initialize() {
    return {
      scopedStore:
        store ??
        createScope({
          atomSet,
          atomFamilySet,
          parentStore,
          scopeName,
        }),
      hasChanged(current: {
        parentStore: Store | ScopedStore
        atomSet: Set<AnyAtom>
        atomFamilySet: Set<AnyAtomFamily>
        store: ScopedStore | undefined
      }) {
        return (
          parentStore !== current.parentStore ||
          !isEqualSet(atomSet, current.atomSet) ||
          !isEqualSet(atomFamilySet, current.atomFamilySet) ||
          store !== current.store
        )
      },
    }
  }

  const [state, setState] = useState(initialize)
  const { hasChanged, scopedStore } = state
  if (hasChanged({ atomSet, atomFamilySet, parentStore, store })) {
    scopedStore[SCOPE].cleanup()
    setState(initialize)
  }
  useHydrateAtoms(
    Array.from(atomsOrTuples).filter(Array.isArray) as AtomDefault[],
    { store: scopedStore }
  )
  useEffect(() => scopedStore[SCOPE].cleanup, [scopedStore])
  return createElement(Provider, { store: scopedStore }, children)
}
