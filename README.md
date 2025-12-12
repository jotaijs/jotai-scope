# jotai-scope

👻🔭 Primitives for nested Jotai scopes

```
npm install jotai-scope
```

## ScopeProvider

`<ScopeProvider>` creates isolated atom state within a React subtree. Components inside the provider get their own copy of the specified atoms, while still accessing unscoped atoms from the parent.

### Key behaviors

- **Opt-in scoping** — only atoms in `atoms` or `atomFamilies` are scoped
- **Derived atoms follow their dependencies** — scope a derived atom and its dependencies become scoped too (within that atom's reads)
- **Nested lookup** — unscoped atoms inherit from the nearest parent scope or store
- **Read and write** — scoping applies to both getting and setting atoms

### Quick start

```tsx
import { atom, useAtom } from 'jotai'
import { ScopeProvider } from 'jotai-scope'

const countAtom = atom(0)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}

function App() {
  return (
    <>
      <Counter />                              {/* global countAtom */}
      <ScopeProvider atoms={[countAtom]}>
        <Counter />                            {/* scoped countAtom */}
      </ScopeProvider>
    </>
  )
}
```

### Examples

**Nested scopes**

```tsx
<ScopeProvider atoms={[countAtom]}>
  <Counter />                          {/* countAtom from outer scope */}
  <ScopeProvider atoms={[nameAtom]}>
    <Counter />                        {/* countAtom inherited, nameAtom scoped */}
  </ScopeProvider>
</ScopeProvider>
```

**Default values**

```tsx
<ScopeProvider atoms={[[countAtom, 42]]}>
  <Counter />                          {/* starts at 42 */}
</ScopeProvider>
```

**Atom families**

```tsx
const itemFamily = atomFamily((id: number) => atom(id))

<ScopeProvider atomFamilies={[itemFamily]}>
  <Items />                            {/* isolated item state */}
</ScopeProvider>
```

### API

```ts
type ScopeProviderProps = {
  atoms?: (Atom | [WritableAtom, initialValue])[]
  atomFamilies?: AtomFamily[]
  children: ReactNode
  name?: string  // for debugging
} | {
  scope: Store   // use a pre-created scope
  children: ReactNode
}
```

<Stackblitz id="vitejs-vite-ctcuhj" file="src%2FApp.tsx" />

### Caveats

* Avoid side effects inside atom read—it may run multiple times per scope. For async atoms, use an abort controller. The extra renders are a known limitation and an active area of research.

**Async atoms and dependency detection**

Scoping decisions are based on synchronous `get` calls only. Dependencies accessed after `await` are not detected for classification purposes.

```tsx
// ❌ scopedAtom may not be detected as a dependency
const asyncAtom = atom(async (get) => {
  await delay(100)
  return get(scopedAtom) // too late for classification
})

// ✅ touch dependencies synchronously first
const asyncAtom = atom(async (get) => {
  const value = get(scopedAtom) // detected
  await delay(100)
  return value
})
```

If you must read atoms after `await`, use `markDependent` to declare dependencies upfront:

```tsx
import { markDependent } from 'jotai-scope'

const asyncAtom = atom(async (get) => {
  await delay(100)
  return get(scopedAtom)
})
markDependent(asyncAtom, [scopedAtom])
```

**Atoms with `INTERNAL_onInit`**

Atom utilities like `atomEffect` that use `INTERNAL_onInit` are always cloned per scope since the store is not known at initialization time.


## markDependent

Declares explicit dependencies for atoms where automatic detection fails (e.g., async atoms with dependencies after `await`).

MarkDependent is an experimental feature and might be removed in a future release.

```tsx
import { atom } from 'jotai'
import { markDependent } from 'jotai-scope'

const asyncAtom = atom(async (get) => {
  await someAsyncOperation()
  return get(a) + get(b)
})
markDependent(asyncAtom, [a, b])
```

## createScope

Low-level API to create a scoped store outside of React.

```tsx
import { createStore } from 'jotai'
import { createScope, ScopeProvider } from 'jotai-scope'

const parentStore = createStore()
const scopedStore = createScope({
  parentStore,
  atoms: [atomA, atomB],
  atomFamilies: [itemFamily],
  name: 'myScope',  // optional, for debugging
})

// Use with ScopeProvider
<ScopeProvider scope={scopedStore}>
  <App />
</ScopeProvider>

// Or nest scopes
const nestedScope = createScope({
  parentStore: scopedStore,
  atoms: [atomC],
})
```

## createIsolation

Both Jotai's Provider and `jotai-scope`'s scoped provider
are still using global contexts.

If you are developing a library that depends on Jotai and
the library user may use Jotai separately in their apps,
they can share the same context. This can be troublesome
because they point to unexpected Jotai stores.

To avoid conflicting the contexts, a utility function called `createIsolation` is exported from `jotai-scope`.

```tsx
import { createIsolation } from 'jotai-scope'

// Use these instead of jotai's exports in your library
const { Provider, ScopeProvider, useStore,useAtom, useAtomValue, useSetAtom } =
  createIsolation()

function LibraryComponent() {
  const [value, setValue] = useAtom(myLibraryAtom)
  // ...
}

function Library() {
  return (
    <Provider>
      <LibraryComponent />
    </Provider>
  )
}
```
