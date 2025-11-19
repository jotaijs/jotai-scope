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
    - mountCallbacks
    - unmountCallbacks

  Calling S0.readAtomState(X) can NEVER cause X to be scoped.
  It is NOT POSSIBLE for ALL to simultaneously have both scoped and unscoped of the same atom.
    - invalidated
    - changed
    - mountCallbacks
    - unmountCallbacks

  ---

  if atom is derived, we will introduce an intermediary atom to use, that atom will either get the original or the clone.

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
S0[___]| A0, B0, C0(A0 + B0), D0(C0)
S1[A,_]| A1, B0, C1_S1(A1 + B0), D1(C1)
S2[B,D]| A1, B2, C1_S2(A1 + B2), D2(C2)

// pseudocode
function scopedReadAtomState(C, scope) {
  if (scope.isExplicit(C)) {
    return atomRead(C, get)
  }
  if (scope.isImplicit(C)) {
    return atomRead(C, get)
  }
  if (isDerived(C)) { // true
    let hasScoped = false
    let isSync = true
    const atomState = cloneAtomState(C)
    const mounted = cloneMounted(C)
    try {
      function get(A1) {
        S0.readAtomState(A1) // S0.readAtomState is the unmodified readAtomState
        if (S1.isScoped(A1)) { // true
          if (!isSync && !hasScoped) {
            throw new Error('Late get of scoped atom A1 inside read of C after dependency collection. Scoping/classification is sync-only; make sure you touch scoped atoms synchronously at the top of C0’s read or mark C0 as dependent.')
          }
          hasScoped = true
          const C1 = ensureCloneAtom(C, S1)
          dependents.add(C1)
          S1.atomStateMap.set(C1, atomState)
          S1.mountedMap.set(C1, mounted)

          // replace C -> C1
          changedAtoms.delete(C) && changedAtoms.add(C1)

          // for each atom in mounted.t, replace with C -> C1 in their mounted.d
          deepReplaceAll(C, C1, mounted.t, (atom) => mountedMap.get(atom).d)

          // for each atom in mounted.t, replace with C -> C1 in their atomState.d
          deepReplaceAll(C, C1, mounted.t, (atom) => atomStateMap.get(atom).d)
          
          // replace C -> C1
          invalidatedAtoms.delete(C) && invalidatedAtoms.add(C1, atomState.n)

          // replace C -> C1
          mountCallbacks.delete(C) && mountCallbacks.set(C1, mounted.n)
          
          // replace C -> C1
          unmountCallbacks.delete(C) && unmountCallbacks.set(C1, mounted.u)
        }
        // ...
      }
      atomRead(C, get)
      // ...
      if (!hasScoped) {
        const atomStateC = S1.atomStateMap.get(C)
        mergeAtomState(atomStateC, atomState)
        const mountedC = S1.mountedMap.get(C)
        mergeMounted(mountedC, mounted)
      }
    } finally {
      isSync = false
    }
  }
  return atomRead(C, get)
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



/*
Note to self:

1. We introduce a proxy atom (_a@S1) and we ensure its readAtom always runs.
2. proxy atom's atomState holds hasScoped, originalAtom, and scopedAtom.
3. proxy atom reads `originalAtom` if !hasScoped otherwise `scopedAtom`.
4. we create a proxy store which has customReadAtomState. This store is created for each scope and shares internals with baseStore.
5. proxy atom calls this customReadAtomState in it's read function.
6. customReadAtomState handles the classification and swapping of atoms.
7. It gets the proxy atom from the original atom or scoped atom, and gets the proxy atom state from the proxy atom.
8. customReadAtomState has a custom getter which checks if the atom is scoped and updates the parent atom's classification if necessary.
9. If classification changes, we swap the original atom for the scoped atom in the tracking data structures.
10. If classification changes asynchronously, this is an error.
*/


/**
 * checks if atomState deps are either dependent or explicit in current scope
 * processes classification change.
 * @returns isScoped: boolean
 */
function processScopeClassification(atom: AnyAtom) {
  const atomState = atomStateMap.get(atom)
  // isUnscoped:
  //   1. all deps are neither explict nor dependent in current scope
  //   2. all deps are the same for both atom states
  if (isUnscoped(atomState, currentScope) {
    updateAtomState(_cAtomState, atomState)
    // handle classification change
    // handle if value change
    return false
  }
  return true
}

customRead() {
  // checks if c0AtomState deps are dependent or explicit in current scope
  if (!processScopeClassification(c0)) {
    return _cAtomState
  }
  get(c1) // read scoped atom
  // checks if c0AtomState deps are dependent or explicit in current scope
  processScopeClassification(c1)
  return _cAtomState
}
