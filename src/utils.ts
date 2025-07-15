import { AnyAtom, CloneAtom } from './types'

export function isCloneAtom<T extends AnyAtom>(atom: T): atom is CloneAtom<T> {
  return 'o' in atom && 'x' in atom
}

export function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every(b.has.bind(b)))
}
