import type { AnyAtom, AnyWritableAtom } from './types'

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
