import { atom as createAtom } from 'jotai'
import type { AnyAtom, AnyWritableAtom } from './types'

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)

export function isEqualSize(
  aIter: Iterable<unknown>,
  bIter: Iterable<unknown>
) {
  const a = new Set(aIter)
  const b = new Set(bIter)
  return (
    aIter === bIter || (a.size === b.size && Array.from(a).every(b.has.bind(b)))
  )
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
