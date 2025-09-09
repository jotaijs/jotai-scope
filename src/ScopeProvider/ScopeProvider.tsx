import type { PropsWithChildren } from 'react'
import { createElement, useEffect, useState } from 'react'
import { Provider, useStore } from 'jotai/react'
import { useHydrateAtoms } from 'jotai/utils'
import type { AnyAtom, AnyAtomFamily, AtomDefault, ScopedStore } from '../types'
import { SCOPE } from '../types'
import { isEqualSet } from '../utils'
import { createScope } from './scope'
import { INTERNAL_Store as Store } from 'jotai/vanilla/internals'

type BaseProps = PropsWithChildren<{
  atoms?: Iterable<AnyAtom | AtomDefault>
  atomFamilies?: Iterable<AnyAtomFamily>
  name?: string
}>

type ProvidedScope = PropsWithChildren<{
  scope: ScopedStore
}>

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
    name: scopeName,
  } = props as BaseProps & ProvidedScope
  const parentStore: Store | ScopedStore = useStore()
  const atoms = Array.from(atomsOrTuples, (a) => (Array.isArray(a) ? a[0] : a))
  const atomSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)

  function initialize() {
    return {
      scope:
        providedScope ??
        createScope({
          atomSet,
          atomFamilySet,
          parentStore,
          name: scopeName,
        }),
      hasChanged(current: {
        parentStore: Store | ScopedStore
        atomSet: Set<AnyAtom>
        atomFamilySet: Set<AnyAtomFamily>
        providedScope: ScopedStore | undefined
      }) {
        return (
          parentStore !== current.parentStore ||
          !isEqualSet(atomSet, current.atomSet) ||
          !isEqualSet(atomFamilySet, current.atomFamilySet) ||
          providedScope !== current.providedScope
        )
      },
    }
  }

  const [state, setState] = useState(initialize)
  const { hasChanged, scope } = state
  if (hasChanged({ atomSet, atomFamilySet, parentStore, providedScope })) {
    scope[SCOPE].cleanup()
    setState(initialize)
  }
  useHydrateAtoms(
    Array.from(atomsOrTuples).filter(Array.isArray) as AtomDefault[],
    { store: scope }
  )
  useEffect(() => scope[SCOPE].cleanup, [scope])
  return createElement(Provider, { store: scope }, children)
}
