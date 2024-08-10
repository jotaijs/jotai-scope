import type { Atom, WritableAtom, getDefaultStore } from 'jotai';
import { AtomFamily } from 'jotai/vanilla/utils/atomFamily';

export type AnyAtom = Atom<unknown> | WritableAtom<unknown, unknown[], unknown>;

export type AnyAtomFamily = AtomFamily<any, AnyAtom>;

export type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;

export type Store = ReturnType<typeof getDefaultStore>;

export type Scope = {
  /**
   * Returns a scoped atom from the original atom.
   * @param anAtom
   * @param implicitScope the atom is implicitly scoped in the provided scope
   * @returns the scoped atom and the scope of the atom
   */
  getAtom: <T extends AnyAtom>(anAtom: T, implicitScope?: Scope) => [T, Scope?];

  /**
   * Cleans up the scope
   */
  cleanup: () => void;

  /**
   * @modifies the atom's write function for atoms that can hold a value
   * @returns a function to restore the original write function
   */
  prepareWriteAtom: <T extends AnyAtom>(
    anAtom: T,
    originalAtom: T,
    implicitScope?: Scope,
  ) => (() => void) | undefined;

  /**
   * @debug
   */
  name?: string;

  /**
   * @debug
   */
  toString?: () => string;
};
