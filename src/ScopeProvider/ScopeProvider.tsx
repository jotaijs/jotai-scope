import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Provider, useStore } from 'jotai/react'
import { useHydrateAtoms } from 'jotai/utils'
import type {
  AnyAtom,
  AnyAtomFamily,
  AtomDefault,
  Scope,
  Store,
} from '../types'
import { createPatchedStore, isTopLevelScope } from './patchedStore'
import { createScope } from './scope'

const ScopeContext = createContext<{
  scope: Scope | undefined
  baseStore: Store | undefined
}>({ scope: undefined, baseStore: undefined })

type ScopeProviderBaseProps = PropsWithChildren<{
  atoms?: Iterable<AnyAtom | AtomDefault>
  atomFamilies?: Iterable<AnyAtomFamily>
  debugName?: string
}>

export function ScopeProvider({
  atoms,
  atomFamilies,
  children,
  debugName,
}: {
  atoms: Iterable<AnyAtom | AtomDefault>
} & ScopeProviderBaseProps): React.JSX.Element

export function ScopeProvider({
  atoms,
  atomFamilies,
  children,
  debugName,
}: {
  atomFamilies: Iterable<AnyAtomFamily>
} & ScopeProviderBaseProps): React.JSX.Element

export function ScopeProvider({
  atoms: atomsOrTuples = [],
  atomFamilies,
  children,
  debugName,
}: ScopeProviderBaseProps) {
  const parentStore: Store = useStore()
  let { scope: parentScope, baseStore = parentStore } = useContext(ScopeContext)
  // if this ScopeProvider is the first descendant scope under Provider then it is the top level scope
  // https://github.com/jotaijs/jotai-scope/pull/33#discussion_r1604268003
  if (isTopLevelScope(parentStore)) {
    parentScope = undefined
    baseStore = parentStore
  }

  const atoms = Array.from(atomsOrTuples, (a) => (Array.isArray(a) ? a[0] : a))

  // atomSet is used to detect if the atoms prop has changed.
  const atomSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)

  function initialize() {
    const scope = createScope(atomSet, atomFamilySet, parentScope, debugName)
    return {
      patchedStore: createPatchedStore(baseStore, scope),
      scopeContext: { scope, baseStore },
      hasChanged(current: {
        baseStore: Store
        parentScope: Scope | undefined
        atomSet: Set<AnyAtom>
        atomFamilySet: Set<AnyAtomFamily>
      }) {
        return (
          parentScope !== current.parentScope ||
          baseStore !== current.baseStore ||
          !isEqualSet(atomSet, current.atomSet) ||
          !isEqualSet(atomFamilySet, current.atomFamilySet)
        )
      },
    }
  }

  const [state, setState] = useState(initialize)
  const { hasChanged, scopeContext, patchedStore } = state
  if (hasChanged({ parentScope, atomSet, atomFamilySet, baseStore })) {
    scopeContext.scope?.cleanup()
    setState(initialize)
  }
  useHydrateAtoms(
    Array.from(atomsOrTuples).filter(Array.isArray) as AtomDefault[],
    { store: patchedStore }
  )
  useEffect(() => scopeContext.scope.cleanup, [scopeContext.scope])
  return (
    <ScopeContext.Provider value={scopeContext}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  )
}

function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every(b.has.bind(b)))
}
