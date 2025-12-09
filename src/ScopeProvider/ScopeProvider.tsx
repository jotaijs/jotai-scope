import type { ComponentType, PropsWithChildren, ReactNode } from 'react'
import { createElement, useEffect, useState } from 'react'
import { Provider, useStore } from 'jotai/react'
import { useHydrateAtoms } from 'jotai/utils'
import { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import type { AnyAtom, AnyAtomFamily, AtomDefault } from '../types'
import { isEqualSize } from '../utils'
import { cleanup, createScope, storeScopeMap } from './scope'

type BaseProps = PropsWithChildren<{
  atoms?: Iterable<AnyAtom | AtomDefault>
  atomFamilies?: Iterable<AnyAtomFamily>
  name?: string
}>

type ProvidedScope = PropsWithChildren<{ scope: Store }>

type ProviderProps = { store: Store; children: ReactNode }

type ScopeProviderComponent = {
  (
    props: {
      atoms: Iterable<AnyAtom | AtomDefault>
    } & BaseProps
  ): React.JSX.Element
  (
    props: {
      atomFamilies: Iterable<AnyAtomFamily>
    } & BaseProps
  ): React.JSX.Element
  (props: PropsWithChildren<{ scope: Store }>): React.JSX.Element
}

export function createScopeProvider(
  ProviderComponent: ComponentType<ProviderProps>,
  useStoreHook: typeof useStore
): ScopeProviderComponent {
  return function ScopeProvider(props: BaseProps | ProvidedScope) {
    const {
      atoms: atomsOrTuples = [],
      atomFamilies = [],
      children,
      scope: providedScope,
      name,
    } = props as BaseProps & ProvidedScope
    const parentStore: Store = useStoreHook()
    const atoms = Array.from(atomsOrTuples, (a) =>
      Array.isArray(a) ? a[0] : a
    )

    function initialize() {
      return [
        providedScope ??
          createScope({ atoms, atomFamilies, parentStore, name }),
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
      const scope = storeScopeMap.get(store)
      if (scope) cleanup(scope)
      setState(initialize)
    }
    useHydrateAtoms(
      Array.from(atomsOrTuples).filter(Array.isArray) as AtomDefault[],
      { store }
    )
    useEffect(() => {
      const scope = storeScopeMap.get(store)
      return () => {
        if (scope) cleanup(scope)
      }
    }, [store])
    return createElement(ProviderComponent, { store, children })
  } as ScopeProviderComponent
}

export const ScopeProvider = createScopeProvider(Provider, useStore)
