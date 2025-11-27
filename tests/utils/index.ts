import { fireEvent } from '@testing-library/react'
import type { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { getAtomLabel } from './debugStore'

export { createDebugStore, createScopes, getAtomLabel } from './debugStore'
export { printAtomState, trackAtomStateMap } from './atomState'
export { printMountedMap, trackMountedMap } from './mounted'
export { createDiffer } from './diff'
export { leftpad } from './leftpad'

function getElements(
  container: HTMLElement,
  querySelectors: string[]
): Element[] {
  return querySelectors.map((querySelector) => {
    const element = container.querySelector(querySelector)
    if (!element) {
      throw new Error(`Element not found: ${querySelector}`)
    }
    return element
  })
}

export function getTextContents(
  container: HTMLElement,
  selectors: string[]
): string[] {
  return getElements(container, selectors).map(
    (element) => element.textContent!
  )
}

export function clickButton(container: HTMLElement, querySelector: string) {
  const button = container.querySelector(querySelector)
  if (!button) {
    throw new Error(`Button not found: ${querySelector}`)
  }
  fireEvent.click(button)
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Order is `S0:A`,`S0:B`,`S1:A`,`S1:B`
 * ```
 * [
 *   [S0:A, S0:B],
 *   [S1:A, S1:B],
 * ]
 * ```
 */
export function cross<
  A extends readonly unknown[],
  B extends readonly unknown[],
  R,
>(
  a: A,
  b: B,
  fn: (a: A[number], b: B[number]) => R
): {
  [a in keyof A]: { [b in keyof B]: R }
} {
  return a.map((a) => b.map((b) => fn(a, b))) as any
}

export function initializeAll(stores: ReadonlyArray<Store>, atoms: AnyAtom[]) {
  return stores.map((store) => atoms.map((atom) => store.get(atom)))
}

export function subscribeAll(stores: ReadonlyArray<Store>, atoms: AnyAtom[]) {
  stores.forEach((store) =>
    atoms.forEach((atom) =>
      store.sub(
        atom,
        new Function(
          `return function ${(store as { name?: string }).name ?? 'Sx'}$${capitalize(getAtomLabel(atom))}(){}`
        )() as () => void
      )
    )
  )
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
