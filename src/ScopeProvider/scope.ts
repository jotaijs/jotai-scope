import { atom, type Atom } from 'jotai';
import type { AnyAtomFamily, AnyAtom, AnyWritableAtom, Scope } from './types';

const globalScopeKey: { name?: string } = {};
if (process.env.NODE_ENV !== 'production') {
  globalScopeKey.name = 'unscoped';
  globalScopeKey.toString = toString;
}

type GlobalScopeKey = typeof globalScopeKey;

export function createScope(
  atoms: Set<AnyAtom>,
  atomFamilies: Set<AnyAtomFamily>,
  parentScope: Scope | undefined,
  scopeName?: string | undefined,
): Scope {
  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>();
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>();
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>;
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>();

  const currentScope: Scope = {
    getAtom,
    cleanup() {},
    prepareWriteAtom(anAtom, originalAtom, implicitScope) {
      if (
        originalAtom.read === defaultRead &&
        isWritableAtom(originalAtom) &&
        isWritableAtom(anAtom) &&
        originalAtom.write !== defaultWrite &&
        currentScope !== implicitScope
      ) {
        // atom is writable with init and holds a value
        // we need to preserve the value, so we don't want to copy the atom
        // instead, we need to override write until the write is finished
        const { write } = originalAtom;
        anAtom.write = createScopedWrite(
          originalAtom.write.bind(
            originalAtom,
          ) as (typeof originalAtom)['write'],
          implicitScope,
        );
        return () => {
          anAtom.write = write;
        };
      }
      return undefined;
    },
  };

  if (scopeName && process.env.NODE_ENV !== 'production') {
    currentScope.name = scopeName;
    currentScope.toString = toString;
  }

  // populate explicitly scoped atoms
  for (const anAtom of atoms) {
    explicit.set(anAtom, [cloneAtom(anAtom, currentScope), currentScope]);
  }

  const cleanupFamiliesSet = new Set<() => void>();
  for (const atomFamily of atomFamilies) {
    for (const param of atomFamily.getParams()) {
      const anAtom = atomFamily(param);
      if (!explicit.has(anAtom)) {
        explicit.set(anAtom, [cloneAtom(anAtom, currentScope), currentScope]);
      }
    }
    const cleanupFamily = atomFamily.unstable_listen((e) => {
      if (e.type === 'CREATE' && !explicit.has(e.atom)) {
        explicit.set(e.atom, [cloneAtom(e.atom, currentScope), currentScope]);
      } else if (!atoms.has(e.atom)) {
        explicit.delete(e.atom);
      }
    });
    cleanupFamiliesSet.add(cleanupFamily);
  }
  currentScope.cleanup = combineVoidFunctions(
    currentScope.cleanup,
    ...Array.from(cleanupFamiliesSet),
  );

  /**
   * Returns a scoped atom from the original atom.
   * @param anAtom
   * @param implicitScope the atom is implicitly scoped in the provided scope
   * @returns the scoped atom and the scope of the atom
   */
  function getAtom<T extends AnyAtom>(
    anAtom: T,
    implicitScope?: Scope,
  ): [T, Scope?] {
    if (explicit.has(anAtom)) {
      return explicit.get(anAtom) as [T, Scope];
    }
    if (implicitScope === currentScope) {
      // dependencies of explicitly scoped atoms are implicitly scoped
      // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
      if (!implicit.has(anAtom)) {
        implicit.set(anAtom, [cloneAtom(anAtom, implicitScope), implicitScope]);
      }
      return implicit.get(anAtom) as [T, Scope];
    }
    const scopeKey = implicitScope ?? globalScopeKey;
    if (parentScope) {
      // inherited atoms are copied so they can access scoped atoms
      // but they are not explicitly scoped
      // dependencies of inherited atoms first check if they are explicitly scoped
      // otherwise they use their original scope's atom
      if (!inherited.get(scopeKey)?.has(anAtom)) {
        const [ancestorAtom, explicitScope] = parentScope.getAtom(
          anAtom,
          implicitScope,
        );
        setInheritedAtom(
          inheritAtom(ancestorAtom, anAtom, explicitScope),
          anAtom,
          implicitScope,
          explicitScope,
        );
      }
      return inherited.get(scopeKey)!.get(anAtom) as [T, Scope];
    }
    if (!inherited.get(scopeKey)?.has(anAtom)) {
      // non-primitive atoms may need to access scoped atoms
      // so we need to create a copy of the atom
      setInheritedAtom(inheritAtom(anAtom, anAtom), anAtom);
    }
    return inherited.get(scopeKey)!.get(anAtom) as [T, Scope?];
  }

  function setInheritedAtom<T extends AnyAtom>(
    scopedAtom: T,
    originalAtom: T,
    implicitScope?: Scope,
    explicitScope?: Scope,
  ) {
    const scopeKey = implicitScope ?? globalScopeKey;
    if (!inherited.has(scopeKey)) {
      inherited.set(scopeKey, new WeakMap());
    }
    inherited.get(scopeKey)!.set(
      originalAtom,
      [
        scopedAtom, //
        explicitScope,
      ].filter(Boolean) as [T, Scope?],
    );
  }

  /**
   * @returns a copy of the atom for derived atoms or the original atom for primitive and writable atoms
   */
  function inheritAtom<T>(
    anAtom: Atom<T>,
    originalAtom: Atom<T>,
    implicitScope?: Scope,
  ) {
    if (originalAtom.read !== defaultRead) {
      return cloneAtom(originalAtom, implicitScope);
    }
    return anAtom;
  }

  /**
   * @returns a scoped copy of the atom
   */
  function cloneAtom<T>(originalAtom: Atom<T>, implicitScope?: Scope) {
    // avoid reading `init` to preserve lazy initialization
    const scopedAtom: Atom<T> = Object.create(
      Object.getPrototypeOf(originalAtom),
      Object.getOwnPropertyDescriptors(originalAtom),
    );

    if (scopedAtom.read !== defaultRead) {
      scopedAtom.read = createScopedRead<typeof scopedAtom>(
        originalAtom.read.bind(originalAtom),
        implicitScope,
      );
    }

    if (
      isWritableAtom(scopedAtom) &&
      isWritableAtom(originalAtom) &&
      scopedAtom.write !== defaultWrite
    ) {
      scopedAtom.write = createScopedWrite(
        originalAtom.write.bind(originalAtom),
        implicitScope,
      );
    }

    return scopedAtom;
  }

  function createScopedRead<T extends Atom<unknown>>(
    read: T['read'],
    implicitScope?: Scope,
  ): T['read'] {
    return function scopedRead(get, opts) {
      return read(
        function scopedGet(a) {
          const [scopedAtom] = getAtom(a, implicitScope);
          return get(scopedAtom);
        }, //
        opts,
      );
    };
  }

  function createScopedWrite<T extends AnyWritableAtom>(
    write: T['write'],
    implicitScope?: Scope,
  ): T['write'] {
    return function scopedWrite(get, set, ...args) {
      return write(
        function scopedGet(a) {
          const [scopedAtom] = getAtom(a, implicitScope);
          return get(scopedAtom);
        },
        function scopedSet(a, ...v) {
          const [scopedAtom] = getAtom(a, implicitScope);
          return set(scopedAtom, ...v);
        },
        ...args,
      );
    };
  }

  return currentScope;
}

function isWritableAtom(anAtom: AnyAtom): anAtom is AnyWritableAtom {
  return 'write' in anAtom;
}

const { read: defaultRead, write: defaultWrite } = atom<unknown>(null);

function toString(this: { name: string }) {
  return this.name;
}

function combineVoidFunctions(...fns: (() => void)[]) {
  return function combinedFunctions() {
    for (const fn of fns) {
      fn();
    }
  };
}
