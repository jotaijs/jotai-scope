import type { Atom, WritableAtom, getDefaultStore } from 'jotai';

export type AnyAtom = Atom<unknown> | WritableAtom<unknown, unknown[], unknown>;
export type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
export type Store = ReturnType<typeof getDefaultStore>;
