// ------------------------------
// Recompute dependents with S0
// ------------------------------
S0[_]| A0, B0, C0(A0 + B0), D0(C0)
S1[A]| A1, B0, C1(A1 + B0), D1(C1)
S2[D]| A0, B0, C1(A1 + B0), D2(C2)

S0.set(B) // invalidates C0, C1, D0, D1
S0.readAtomState(C0)
  S0.readAtomState(A0)
  S0.readAtomState(B0)
S0.readAtomState(C1) // C1 is clone
  S0.readAtomState(A1) // A1 is clone
  S0.readAtomState(B0)
S0.readAtomState(D0)
  S0.readAtomState(C0)

// ------------------------------
// Changing classification with S0
// ------------------------------
S0[_]| A0, B0, C0(A0 + B0), D0(C0)
S1[A]| A1, B0, C1(A1 + B0), D1(C1)
S2[D]| A0, B0, C1(A1 + B0), D2(C2)

/**
  Cannot modify S0.readAtomState - we need to find another way to do this.
  
  C1 is a clone with implicit scoping – This means that C1 when read at any scope level will read A1.
  ```ts
  if (S0.isScoped(A1)) {...} // can be true – when `S0.set(B)` causes recompute dependents to run with S0 for C1.
  ```

  C1.read – calls S1.readAtomState(C1)
  Calling S1.readAtomState(A1) can effect All because these are proxied
    - atomState
    - mounted
    - invalidated
    - changed

  Calling S0.readAtomState(X) can NEVER cause X to be scoped.

  ---

  S0.readAtomState is UNMODIFIED!
*/
S0.readAtomState = (C0) => {
  if (earlyReturn(C0)) {
    return S0.atomStateMap.get(C0)
  }
  function get() {/* ... */}
  atomRead(C0, get)
  // ...
}

// ------------------------------
// Changing classification with S1
// ------------------------------
S0[_]| A0, B0, C0(A0 + B0), D0(C0)
S1[A]| A1, B0, C1(A1 + B0), D1(C1)
S2[D]| A0, B0, C1(A1 + B0), D2(C2)

S1.readAtomState = (C0) => {
  if (earlyReturn(C0)) {
    return S1.atomStateMap.get(C0)
  }
  if (isDerived(C0)) { // true
    let hasScoped = false
    let isSync = true
    const atomState = cloneAtomState(C0)
    const mounted = cloneMounted(C0)
    try {
      function get(A1) {
        S1.readAtomState(A1)
        if (S1.isScoped(A1)) { // true
          if (!isSync && !hasScoped) {
            throw new Error('Late get of scoped atom A1 inside read of C0 after dependency collection. Scoping/classification is sync-only; make sure you touch scoped atoms synchronously at the top of C0’s read or mark C0 as dependent.')
          }
          hasScoped = true
          const C1 = ensureCloneAtom(C)
          S1.atomStateMap.set(C1, atomState)
          S1.mountedMap.set(C1, mounted)
          deepReplace(C0, C1, mounted.d)
          deepReplace(C0, C1, mounted.t)
          deepReplace(C0, C1, atomState.d)
        }
      }
      atomRead(C0, get)
      // ...
      if (!hasScoped) {
        const atomStateC0 = S1.atomStateMap.get(C0)
        Object.assign(atomStateC0, atomState)
      }
    } finally {
      isSync = false
    }
  }
}

S1.isScoped = (atom) => {
  if (explicit.has(atom)) {
    return true
  }
  if (implicit.has(atom)) {
    return true
  }
  if (dependent.has(atom)) {
    return true
  }
  return parentScope?.isScoped(atom) ?? false
}

function isDerived(atom) {
  return atom.read !== defaultRead
}
