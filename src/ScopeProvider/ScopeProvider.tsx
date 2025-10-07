import type { PropsWithChildren } from 'react'
import { createElement, useEffect, useState } from 'react'
import { Provider, useStore } from 'jotai/react'
import { useHydrateAtoms } from 'jotai/utils'
import { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import type { AnyAtom, AnyAtomFamily, AtomDefault, ScopedStore } from '../types'
import { storeScopeMap } from '../types'
import { isEqualSize } from '../utils'
import { createScope } from './scope'

type BaseProps = PropsWithChildren<{
  atoms?: Iterable<AnyAtom | AtomDefault>
  atomFamilies?: Iterable<AnyAtomFamily>
  name?: string
}>

type ProvidedScope = PropsWithChildren<{ scope: ScopedStore }>

export function ScopeProvider(
  props: {
    atoms: Iterable<AnyAtom | AtomDefault>
  } & BaseProps
): React.JSX.Element

export function ScopeProvider(
  props: {
    atomFamilies: Iterable<AnyAtomFamily>
  } & BaseProps
): React.JSX.Element

export function ScopeProvider(
  props: PropsWithChildren<{ scope: ScopedStore }>
): React.JSX.Element

export function ScopeProvider(props: BaseProps | ProvidedScope) {
  const {
    atoms: atomsOrTuples = [],
    atomFamilies = [],
    children,
    scope: providedScope,
    name,
  } = props as BaseProps & ProvidedScope
  const parentStore: Store = useStore()
  const atoms = Array.from(atomsOrTuples, (a) => (Array.isArray(a) ? a[0] : a))

  function initialize() {
    return [
      providedScope ?? createScope({ atoms, atomFamilies, parentStore, name }),
      function hasChanged(current: {
        parentStore: Store
        atoms: Iterable<AnyAtom | AtomDefault>
        atomFamilies: Iterable<AnyAtomFamily>
        providedScope: Store | undefined
      }) {
        return (
          parentStore !== current.parentStore ||
          !isEqualSize(atoms, current.atoms) ||
          !isEqualSize(atomFamilies, current.atomFamilies) ||
          providedScope !== current.providedScope
        )
      },
    ] as const
  }

  const [[store, hasChanged], setState] = useState(initialize)
  if (hasChanged({ atoms, atomFamilies, parentStore, providedScope })) {
    storeScopeMap.get(store)?.cleanup()
    setState(initialize)
  }
  useHydrateAtoms(
    Array.from(atomsOrTuples).filter(Array.isArray) as AtomDefault[],
    { store }
  )
  useEffect(() => storeScopeMap.get(store)?.cleanup, [store])
  return createElement(Provider, { store }, children)
}
