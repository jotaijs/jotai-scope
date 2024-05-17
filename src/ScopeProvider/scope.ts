import { atom, type Atom } from 'jotai';
import { type AnyAtom, type AnyWritableAtom } from './types';

export type Scope = {
  getAtom: <T extends AnyAtom>(originalAtom: T, fromScoped?: boolean) => T;
};

export function createScope(
  atoms: Iterable<AnyAtom>,
  parentScope: Scope | undefined,
): Scope {
  const explicit = new WeakMap<AnyAtom, AnyAtom>();
  const implicit = new WeakMap<AnyAtom, AnyAtom>();
  const inherited = new WeakMap<AnyAtom, AnyAtom>();
  const unscoped = new WeakMap<AnyAtom, AnyAtom>();

  // populate explicit scope map
  for (const anAtom of atoms) {
    const scopedCopy = copyAtom(anAtom, true);
    explicit.set(anAtom, scopedCopy);
  }

  /**
   * Creates a scoped atom from the original atom.
   * All dependencies of the original atom will be implicitly scoped.
   * All scoped atoms will be inherited scoped in nested scopes.
   * @param anAtom
   * @param isScoped - the atom is a dependency of an explicitly scoped atom
   * @returns
   */
  function copyAtom<T>(anAtom: Atom<T>, isScoped = false) {
    // avoid reading `init` to preserve lazy initialization
    const scopedAtom: Atom<T> = Object.create(
      Object.getPrototypeOf(anAtom),
      Object.getOwnPropertyDescriptors(anAtom),
    );

    if ('read' in scopedAtom) {
      // inherited atoms should preserve their value
      if (scopedAtom.read === defaultRead) {
        const self = isScoped ? scopedAtom : anAtom;
        scopedAtom.read = defaultRead.bind(self) as Atom<T>['read'];
      } else {
        scopedAtom.read = (get, opts) => {
          return anAtom.read((a) => {
            return get(getAtom(a, isScoped));
          }, opts);
        };
      }
    }

    if ('write' in scopedAtom) {
      if (scopedAtom.write === defaultWrite) {
        const self = isScoped ? scopedAtom : anAtom;
        scopedAtom.write = defaultWrite.bind(self);
      } else {
        (scopedAtom as AnyWritableAtom).write = (get, set, ...args) => {
          return (anAtom as AnyWritableAtom).write(
            (a) => get(getAtom(a, isScoped)),
            (a, ...v) => set(getAtom(a, isScoped), ...v),
            ...args,
          );
        };
      }
    }

    // eslint-disable-next-line camelcase
    scopedAtom.unstable_is = (a: AnyAtom) => {
      return a === scopedAtom || (a.unstable_is?.(anAtom) ?? a === anAtom);
    };

    return scopedAtom;
  }

  function getAtom<T extends AnyAtom>(anAtom: T, fromScoped = false): T {
    if (explicit.has(anAtom)) {
      return explicit.get(anAtom) as T;
    }
    // atom is a dependency of an explicitly scoped atom
    if (fromScoped && !implicit.has(anAtom)) {
      implicit.set(anAtom, copyAtom(anAtom, true));
    }
    if (implicit.has(anAtom)) {
      return implicit.get(anAtom) as T;
    }
    if (inherited.has(anAtom)) {
      return inherited.get(anAtom) as T;
    }
    if (parentScope) {
      const inheritedAtom = copyAtom(parentScope.getAtom(anAtom));
      inherited.set(anAtom, inheritedAtom);
      return inherited.get(anAtom) as T;
    }
    // derived atoms may need to access scoped atoms
    if (!isPrimitiveAtom(anAtom) && !unscoped.has(anAtom)) {
      unscoped.set(anAtom, copyAtom(anAtom));
    }
    if (unscoped.has(anAtom)) {
      return unscoped.get(anAtom) as T;
    }
    return anAtom;
  }

  return { getAtom };
}

function isPrimitiveAtom(anAtom: AnyAtom) {
  return (
    anAtom.read === defaultRead &&
    'write' in anAtom &&
    anAtom.write === defaultWrite
  );
}

const { read: defaultRead, write: defaultWrite } = atom<unknown>(null);
