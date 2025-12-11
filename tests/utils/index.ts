import { fireEvent } from '@testing-library/react'
import chalk from 'chalk'
import {
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_AtomState as AtomState,
  type INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { printAtomState } from './atomState'
import { getAtomLabel } from './debugStore'
import { leftpad } from './leftpad'
import { printMountedMap } from './mounted'

export { createDebugStore, createScopes, getAtomLabel, hydrateScopes } from './debugStore'
export { printAtomState, printSortedAtomState, trackAtomStateMap } from './atomState'
export { printMountedMap, trackMountedMap } from './mounted'
export { createDiffer } from './diff'
export { leftpad } from './leftpad'

function getElements(container: HTMLElement, querySelectors: string[]): Element[] {
  return querySelectors.map((querySelector) => {
    const element = container.querySelector(querySelector)
    if (!element) {
      throw new Error(`Element not found: ${querySelector}`)
    }
    return element
  })
}

export function getTextContents(container: HTMLElement, selectors: string[]): string[] {
  return getElements(container, selectors).map((element) => element.textContent!)
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
export function cross<A extends readonly unknown[], B extends readonly unknown[], R>(
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
          `return function ${getAtomLabel(atom)}$${(store as { name?: string }).name ?? 'Sx'}(){}`
        )() as () => void
      )
    )
  )
}

export function printHeader(header: string, secondaryHeader?: string) {
  console.log(
    chalk.gray('-'.repeat(80)),
    `\n${chalk.yellow(header)} ${secondaryHeader ? `${secondaryHeader}` : ''}\n`,
    chalk.gray('-'.repeat(80))
  )
}

export function printAtomStateDiff([store]: [Store, ...Store[]]) {
  console.log(`AtomState`)
  console.log(leftpad(printAtomState.diff(store)))
}

export function printMountedDiff([store]: Store[]) {
  console.log(`MountedMap`)
  console.log(leftpad(printMountedMap.diff(store)))
}

export function getAtomByLabel([store]: [Store, ...Store[]], label: string) {
  const buildingBlocks = getBuildingBlocks(store)
  const atomStateMap = buildingBlocks[0] as Map<AnyAtom, AtomState>
  return Array.from(atomStateMap.keys()).find((a) => a.debugLabel === label)!
}
