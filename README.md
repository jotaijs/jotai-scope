# jotai-scope

👻🔭 *Isolate Jotai atoms with scope*

## ScopeProvider

---

### Why

`<ScopeProvider>` lets you reuse the *same* atoms in different parts of the React tree **without sharing state** while still be able to read other atoms from the parent store.

---

### At‑a‑glance

* Scopes are opt‑in. Only atoms listed in `atoms` or `atomFamilies`.
* **Derived atoms** work intuitively.

  * **Unscoped derived** atoms can read both unscoped and scoped atoms.
  * **Implicit dependency scoping.** When you scope a derived atom, every atom it touches (recursive) is scoped automatically, but only when read by the derived atom. Outside the derived atom, it continues to be unscoped.
* **Nested lookup.** If a scope can’t find the atom in the current scope, it bubbles to the nearest parent scope, up to the nearest store.
* Works for both reading from atoms *and* writing to atoms.

---

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
      <button onClick={() => setCount(c => c + 1)}>+1</button>
      <span>{count} → {doubled}</span>
    </>
  )
}

export default function App() {
  return (
    <Provider>
      <Counter /> {/* doubledAtom uses the parent store */}
      <ScopeProvider atoms={[doubledAtom]}>
        <Counter /> {/* doubledAtom is isolated */}
      </ScopeProvider>
    </Provider>
  )
}
```

The second counter owns a private `doubledAtom` *and* a private `countAtom` because`doubledAtom` is scoped.

---

**2 · Nested scopes**

```tsx
<ScopeProvider atoms={[countAtom]} debugName="S1">
  <Counter />         {/* countAtom is read from S1 */}
  <ScopeProvider atoms={[nameAtom]} debugName="S2">
    <Counter />       {/* count is read from S1 & nameAtom is read from S2 */}
  </ScopeProvider>
</ScopeProvider>
```

* Outer scope (S1) isolates `countAtom`.
* Inner scope (S2) isolates `nameAtom` and looks up the tree and finds `countAtom` in S1

---

**3 · Providing default values**

```tsx
<ScopeProvider atoms={[[countAtom, 42]]}>
  <Counter />   {/* starts at 42 inside this scope, yay! */}
</ScopeProvider>
```

Mix tuples and plain atoms as needed: `atoms={[[countAtom, 1], anotherAtom]}`.

---

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

---

**A helpful syntax for describing nested scopes**

```
a, b, C(a + b), D(a + C)
S1[a]: a1, b0, C0(a1 + b0), D0(a1 + C0(a1 + b0))
S2[C, D]: a1, b0, C2(a2 + b2), D2(a2 + C2(a2 + b2))
```
Above:
  - Scope S1 is the first scope under the store provider (S0). S1 scopes a, so a1 refers to the scoped a in S1.
  - C is a derived atom. C reads a and b. In S1, C is not scoped so it reads a1 and b0 from S1.
  - C is scoped in S2, so it reads a from S2 and b from S2. This is because atom dependencies of scoped atoms are _implicitly scoped_.
  - Outside C and D in S2, a and b still inherit from S1.
  - C and D are both scoped in S2, so they both reads a2 and b2. C and D share the same atom dependencies. a2 in C2 and a2 in D2 are the same atom.

### API

```ts
interface ScopeProviderProps {
  atoms: (Atom<any> | [WritableAtom<any, any[], any>, any])[]
  atomFamilies: AtomFamily<any, any>[]
  children: React.ReactNode
  debugName?: string
}
```

---

### Caveats

* Avoid side effects inside `get`—it may run multiple times per scope. For async atoms, use an abort controller or move it to an atom effect. The extra renders are a known limitation and rewrite solutions are being researched. If you are interested in helping, please [join the discussion](https://github.com/jotaijs/jotai-scope/issues/25).

---

## createIsolation

`createIsolation` is useful for library authors to create a private store for libraries that use Jotai. It provides a private `Provider` and hooks that do not share state with the global store.

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

---

MIT © 2025 jotai‑scope team
