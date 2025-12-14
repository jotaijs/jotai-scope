# Notes on how to solve

**1. recompute a0 in s0 causes updates to a1 with the wrong store.**

If a0 is changed in S0, then recomputeInvalidatedDependents causes `readAtomState(s0, c1)` <-- wrong store. Fixing this simplifies edge cases of having the handle scope logic from inside the base store. Since recomputeInvalidatedAtoms fires for async get, we can rely on the recompute storehook.

---

1.

```ts
  readAtomState
  getter
    finally
      if (mountedMap.has(atom))
        mountedMap.get(a)?.t.add(atom)
```

2.

```ts
mountDependencies
if (mounted && !isPendingPromise(atomState.v))
  for (const [a, n] of atomState.d) if (!mounted.d.has(a)) aMounted.t.add(atom)
```

3. mountAtom

```ts
if (!mounted) for (const a of atomState.d.keys()) const aMounted = mountAtom(store, a)
aMounted.t.add(atom)
```

---

2. storeHook for when recomputeInvalidatedAtoms
3. listen to dependencies for change to add to invalidatedDependents
4.

When you do `mountDependencies(s1, c1)`, you add storeHooks, instead of adding to `a0Mounted.t(c1)`.

---

For `mounted.t`:

When we do `a0Mounted.t.add(c1)` in `mountDependencies(s1, c1)` or `mountAtom(s1, c1)` or `readAtomState(s1, c1)`'s `get(a0)`, we:

1. add a storeHook.onRecomputeInvalidatedAtoms(a0)` (for all of c1's inherited dependencies).
2. add a `storeHook.c(a0)` (for all of c1's inherited dependencies) to call `invalidateDependents(s1, c1)`
3. Instead of doing `a0Mounted.t.add(c1)` we do `a0Mounted.t(fakeAtom)` to prevent `a0` from unmounting in `unmountAtom(a0)`. We later remove `fakeAtom` when `c1` unmounts.

Needed API

1. storeHook for when recomputeInvalidatedAtoms fires.

---

This one is tricky

```
S0[_]: a0, b0, c0(b0 + d0), d0(a0)
S1[b]: a0, b1, c0(b1 + d0), d0(a0)
```

`s0.set(a0)`
We need to call the recompute storeHook for each hasChangedDeps atom.

Hmm, I should be able to use `storeHooks.c` to detect changes to dependencies and one final call from the recompute storeHook to trigger `recomputeInvalidatedAtoms(s1, d1)`.
