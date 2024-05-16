import { atom, type Atom } from 'jotai';
import { type AnyAtom, type AnyWritableAtom } from './types';

export type Scope = {
  getAtom: <T extends AnyAtom>(originalAtom: T, fromScoped?: boolean) => T;
};

// let i = 0;

export function createScope(
  atoms: Iterable<AnyAtom>,
  parentScope: Scope | undefined,
  name?: string,
): Scope {
  const log = console.log.bind(console, name);
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
    log('copyAtom', anAtom.debugLabel, { isScoped });
    // avoid reading `init` to preserve lazy initialization
    const scopedAtom: Atom<T> = Object.create(
      Object.getPrototypeOf(anAtom),
      Object.getOwnPropertyDescriptors(anAtom),
    );
    scopedAtom.debugLabel = `${name}:${anAtom.debugLabel}`;

    if ('read' in scopedAtom) {
      // inherited atoms should preserve their value
      if (scopedAtom.read === defaultRead) {
        const self = isScoped ? scopedAtom : anAtom;
        scopedAtom.read = defaultRead.bind(self) as Atom<T>['read'];
      } else {
        scopedAtom.read = (get, opts) => {
          log(scopedAtom.debugLabel, 'scopedAtom.read outer');
          return anAtom.read((a) => {
            log(
              scopedAtom.debugLabel,
              'scopedAtom.read inner',
              anAtom.debugLabel,
            );
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

    // // eslint-disable-next-line camelcase
    // // @ts-ignore
    // scopedAtom.unstable_is = (a: AnyAtom, from: any) => {
    //   if (i++ > 10) throw new Error('unstable_is');
    //   log(scopedAtom.debugLabel, 'unstable_is', {
    //     a: a.debugLabel,
    //     anAtom: anAtom.debugLabel,
    //     from,
    //   });
    //   const result =
    //     a === scopedAtom ||
    //     // @ts-ignore
    //     (a.unstable_is?.(anAtom, scopedAtom.debugLabel) ?? a === anAtom);
    //   log(scopedAtom.debugLabel, 'unstable_is', {
    //     result,
    //     'a === scopedAtom': a === scopedAtom,
    //     unstable_is: !!a.unstable_is,
    //   });
    //   return result;
    // };

    return scopedAtom;
  }

  function getAtom<T extends AnyAtom>(anAtom: T, fromScoped = false): T {
    if (explicit.has(anAtom)) {
      log('getAtom-explicit', anAtom.debugLabel);
      return explicit.get(anAtom) as T;
    }
    // atom is a dependency of an explicitly scoped atom
    if (fromScoped && !implicit.has(anAtom)) {
      log('getAtom-implicit-create', anAtom.debugLabel);
      implicit.set(anAtom, copyAtom(anAtom, true));
    }
    if (implicit.has(anAtom)) {
      log('getAtom-implicit', anAtom.debugLabel);
      return implicit.get(anAtom) as T;
    }
    if (inherited.has(anAtom)) {
      log('getAtom-inherited', anAtom.debugLabel);
      return inherited.get(anAtom) as T;
    }
    if (parentScope) {
      const inheritedAtom = copyAtom(parentScope.getAtom(anAtom));
      inherited.set(anAtom, inheritedAtom);
      log('getAtom-fromParent', anAtom.debugLabel);
      return inherited.get(anAtom) as T;
    }
    // derived atoms should may need to access scoped atoms
    if (!isPrimitiveAtom(anAtom) && !unscoped.has(anAtom)) {
      log('getAtom-unscoped-create', anAtom.debugLabel);
      unscoped.set(anAtom, copyAtom(anAtom));
    }
    if (unscoped.has(anAtom)) {
      log('getAtom-unscoped', anAtom.debugLabel);
      return unscoped.get(anAtom) as T;
    }
    log('getAtom-original', anAtom.debugLabel);
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
