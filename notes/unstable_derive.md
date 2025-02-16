# Objectives

1. Derived atoms are not copied if they don’t depend on scoped atoms.
2. When a derived atom starts depending on a scoped atom, a new atom state is created as the scoped atom state.
3. When a derived atom stops depending on a scoped atom, it must be removed from the scope state and restored to the original atom state.
   a. When changing between scoped and unscoped, all subscibers must be notified.

   Fixes:

   - [Scope caused atomWithObservable to be out of sync](https://github.com/jotaijs/jotai-scope/issues/36)
   - [Computed atoms get needlessly triggered again](https://github.com/jotaijs/jotai-scope/issues/25)

# Requirements

1. Some way to track dependencies of computed atoms not in the scope without copying them.
2. Some way to get whether the atom has been mounted.

# Problem Statement

A computed atom may or may not consume scoped atoms. This may also change as state changes.

```tsx
const providerAtom = atom('unscoped')
const scopedProviderAtom = atom('scoped')
const shouldConsumeScopedAtom = atom(false)
const consumerAtom = atom((get) => {
  if (get(shouldConsumeScopedAtom)) {
    return get(scopedProviderAtom)
  }
  return get(providerAtom)
})

function Component() {
  const value = useAtomValue(consumerAtom)
  return value
}

function App() {
  const setShouldConsumeScopedAtom = useSetAtom(shouldConsumeScopedAtom)
  useEffect(() => {
    const timeoutId = setTimeout(setShouldConsumeScopedAtom, 1000, true)
    return () => clearTimeout(timeoutId)
  }, [])

  return (
    <ScopeProvider atoms={[scopedProviderAtom]}>
      <Component />
    </ScopeProvider>
  )
}
```

To properly handle `consumerAtom`, we need to track the dependencies of the computed atom.

# Proxy State

Atom state has the following shape;

```ts
type AtomState = {
  d: Map<AnyAtom, number>; // map of atom consumers to their epoch number
  p: Set<AnyAtom>; // set of pending atom consumers
  n: number; // epoch number
  m?: {
    l: Set<() => void>; // set of listeners
    d: Set<AnyAtom>; // set of mounted atom consumers
    t: Set<AnyAtom>; // set of mounted atom providers
    u?: (setSelf: () => any) => (void | () => void); // unmount function
  };
  v?: any; // value
  e?: any; // error
};
```

All computed atoms (`atom.read !== defaultRead`) will have their base atomState converted to a proxy state. The proxy state will track dependencies and notify when they change.

0. Update all computed atoms with a proxy state in the parent store.
1. If a computer atom does not depend on any scoped atoms, remove it from the unscopedComputed set
2. If a computed atom starts depending on a scoped atom, add it to the scopedComputed set.
   a. If the scoped state does not already exist, create a new scoped atom state.
3. If a computed atom stops depending on a scoped atom, remove it from the scopedComputed set.
