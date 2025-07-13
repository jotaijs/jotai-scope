# jotai-scope

👻🔭 *Isolate Jotai atoms with scope*

### Install

```
npm install jotai-scope
```

## ScopeProvider

While Jotai's Provider allows to scope Jotai's store under a subtree, we can't use the store above the tree within the subtree.

A workaround is to use `store` option in useAtom and other hooks.

Instead of specifying the `store` option, `<ScopeProvider>` lets you reuse the *same* atoms in different parts of the React tree **without sharing state** while still being able to read other atoms from the parent store.

### At‑a‑glance

* Scopes are opt‑in. Only atoms listed in `atoms` or `atomFamilies` are explicitly scoped.
* **Unscoped derived** atoms can read both unscoped and scoped atoms.
* **Scoped derived** atoms implicitly scope their atom dependencies. When you scope a derived atom, every atom it touches (recursively) is scoped automatically, but only when read by the derived atom. Outside the derived atom, it continues to be unscoped.
* **Nested lookup.** If a scope can’t find the atom in the current scope, it inherits from the nearest parent scope, up to the nearest store.
* Scoping works for both reading from atoms *and* writing to atoms.

### Quick Start

```tsx
import { Provider, atom, useAtom, useAtomValue } from 'jotai'
import { ScopeProvider } from 'jotai-scope'
```

**1 · Isolating a counter**

```tsx
const countAtom = atom(0)
const doubledAtom = atom((get) => get(countAtom) * 2)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  const doubled = useAtomValue(doubledAtom)
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
      <span>{count} → {doubled}</span>
    </>
  )
}

export default function App() {
  return (
    <Provider>
      <Counter /> {/* doubledAtom uses the parent store */}
      <ScopeProvider atoms={[doubledAtom]}>
        <Counter /> {/* doubledAtom is scoped */}
      </ScopeProvider>
    </Provider>
  )
}
```

The second counter owns a private `doubledAtom` *and* a private `countAtom` because `doubledAtom` is scoped.

**2 · Nested scopes**

```tsx
<ScopeProvider atoms={[countAtom]} debugName="S1">
  <Counter />         {/* countAtom is read from S1 */}
  <ScopeProvider atoms={[nameAtom]} debugName="S2">
    <Counter />       {/* countAtom is read from S1 & nameAtom is read from S2 */}
  </ScopeProvider>
</ScopeProvider>
```

* Outer scope (S1) isolates `countAtom`.
* Inner scope (S2) isolates `nameAtom`, then looks up the tree and finds `countAtom` in S1.

**3 · Providing default values**

```tsx
<ScopeProvider atoms={[[countAtom, 42]]}>
  <Counter />   {/* starts at 42 inside this scope */}
</ScopeProvider>
```

Mix tuples and plain atoms as needed: `atoms={[[countAtom, 1], anotherAtom]}`.

**4 · Scoping an atomFamily**

```tsx
import { atom, atomFamily, useAtom } from 'jotai'
import { ScopeProvider } from 'jotai-scope'

const itemFamily = atomFamily((id: number) => atom(id))

<Component />     {/* Unscoped items */}
<ScopeProvider atomFamilies={[itemFamily]}>
  <Component />   {/* Isolated items */}
</ScopeProvider>

```

Inside the `<ScopeProvider>` every `itemFamily(id)` call resolves to a scoped copy, so items rendered inside the provider are independent from the global ones and from any sibling scopes.

**A helpful syntax for describing nested scopes**

```
a, b, c(a + b), d(a + c)
S1[a]:    a1, b0, c0(a1 + b0), d0(a1 + c0(a1 + b0))
S2[c, d]: a1, b0, c2(a2 + b2), d2(a2 + c2(a2 + b2))
```
Above:
- Scope **S1** is the first scope under the store provider (**S0**). **S1** scopes **a**, so **a1** refers to the scoped **a** in **S1**.
- **c** is a derived atom. **c** reads **a** and **b**. In **S1**, **c** is not scoped so it reads **a1** and **b0** from **S1**.
- **c** is scoped in **S2**, so it reads **a** from **S2** and **b** from **S2**. This is because atom dependencies of scoped atoms are _implicitly scoped_.
- Outside **c** and **d** in **S2**, **a** and **b** still inherit from **S1**.
- **c** and **d** are both scoped in **S2**, so they both read **a2**. Implicit dependencies are shared across scoped atoms in the same scope so **a2** in **c2** and **a2** in **d2** are the same atom.

### API

```ts
interface ScopeProviderProps {
  atoms?: (Atom<any> | [WritableAtom<any, any[], any>, any])[]
  atomFamilies?: AtomFamily<any, any>[]
  children: React.ReactNode
  debugName?: string
}
```

### Caveats

* Avoid side effects inside atom read—it may run multiple times per scope. For async atoms, use an abort controller. The extra renders are a known limitation and solutions are being researched. If you are interested in helping, please [join the discussion](https://github.com/jotaijs/jotai-scope/issues/25).


<Stackblitz id="vitejs-vite-ctcuhj" file="src%2FApp.tsx" />

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

const { Provider, useStore, useAtom, useAtomValue, useSetAtom } =
  createIsolation()

function Library() {
  return (
    <Provider>
      <LibraryComponent />
    </Provider>
  )
}
```
