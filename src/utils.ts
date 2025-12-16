import { atom as createAtom } from 'jotai'
import { INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks } from 'jotai/vanilla/internals'
import type { AnyAtom, AnyWritableAtom, StoreHookWithOnce } from './types'

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)

export function isEqualSize(aIter: Iterable<unknown>, bIter: Iterable<unknown>) {
  const a = new Set(aIter)
  const b = new Set(bIter)
  return aIter === bIter || (a.size === b.size && Array.from(a).every(b.has.bind(b)))
}

export function toNameString(this: { name: string }) {
  return this.name
}

export function isWritableAtom(atom: AnyAtom): atom is AnyWritableAtom {
  return 'write' in atom
}

export function isDerived(atom: AnyAtom): boolean {
  return atom.read !== defaultRead
}

export function isCustomWrite(atom: AnyAtom): boolean {
  return isWritableAtom(atom) && atom.write !== defaultWrite
}

function withOnce(fn: Omit<StoreHookWithOnce, 'once'>): StoreHookWithOnce {
  function once(callback: () => void): void {
    const removeOnce = fn.add(function addOnce() {
      callback()
      removeOnce()
    })
  }
  return Object.assign(fn, { once }) as StoreHookWithOnce
}

export function storeHookWithOnce(): StoreHookWithOnce {
  return withOnce(initializeStoreHooks({}).f)
}

export function getAtomLabel(atom: AnyAtom) {
  return atom.debugLabel ?? String(atom)
}
