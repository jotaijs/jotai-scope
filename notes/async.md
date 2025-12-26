# Notes on how to solve

**1. async case**

```
S0[_]: a0, b0, c0(a0 then b0)
S1[b]: a0, b1, c0(a0 then b1)
```

---

For `atomState.p`:

When we do `addPendingPromiseToDependency(c1, c1PromiseValue, a0State)`, we:

1. add a storeHook.onRecomputeInvalidatedAtoms(a0)` (for all of c1's inherited dependencies).
2. We don't do `dependencyAtomState.p.add(atom)`

Needed API

1. storeHook for when recomputeInvalidatedAtoms fires.

---

Chained async dependency

```
S0[_]: a0, b0, c0(a0 then b0), d0(b0)
S1[b]: a0, b1, c0(a0 then d1), d1(b1)
```

if we only subscribe c0, then we don't know d's classification.
