import { fireEvent } from '@testing-library/react'
import { createScope } from 'jotai-scope'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_BuildingBlocks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'

//
// Debug Store
//

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<INTERNAL_BuildingBlocks>

type DebugStore = Store & { name: string }

export function createDebugStore(name: string = `S0`): DebugStore {
  const buildingBlocks: Partial<BuildingBlocks> = []
  const atomStateMap = (buildingBlocks[0] = new Map())
  const mountedMap = (buildingBlocks[1] = new Map())
  const storeHooks = (buildingBlocks[6] = initializeStoreHooks({}))
  function getAtomLabel(atom: AnyAtom) {
    return (atom.debugLabel ?? String(atom))
      .replace(/@S(\d+)$/, '$1')
      .replace(/[^a-zA-Z0-9_]/g, '$')
  }
  storeHooks.i.add(undefined, (atom) => {
    const label = getAtomLabel(atom)
    atom.toString = function toString() {
      return label
    }
    const p = new Function(`return function ${label}(){}`)()
    Object.setPrototypeOf(atom, p.prototype)
    const atomState = atomStateMap.get(atom)!
    Object.assign(atomState, { label })
  })
  storeHooks.m.add(undefined, (atom) => {
    const label = getAtomLabel(atom)
    const mounted = mountedMap.get(atom)!
    Object.assign(mounted, { label })
  })
  const debugStore = buildStore(...buildingBlocks)
  return Object.assign(debugStore, { name })
}

export function createScopes<T extends AnyAtom[][]>(
  ...scopesAtoms: T
): [
  Store,
  ...{
    [K in keyof T]: T[K] extends AnyAtom[] ? Store : never
  },
] {
  const store = createDebugStore()
  Object.assign(store, { name: 'S0' }, store)
  return scopesAtoms.reduce(
    (scopes, atoms, i) => {
      const scope = createScope({
        atoms,
        parentStore: scopes[i],
        name: `S${i + 1}`,
      })
      scopes.push(scope)
      return scopes
    },
    [store] as Store[]
  ) as any
}

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
  stores.forEach((store) => atoms.forEach((atom) => store.sub(atom, () => {})))
}

export function printAtomState(store: Store) {
  let buildingBlocks = getBuildingBlocks(store)
  function resolveEnhancer(bb: Readonly<BuildingBlocks>) {
    return bb[24]?.(bb)
  }
  while (resolveEnhancer(buildingBlocks)) {
    buildingBlocks = resolveEnhancer(buildingBlocks)!
  }
  if (buildingBlocks[0] instanceof WeakMap) {
    throw new Error('Cannot print atomStateMap, store must be debug store')
  }
  const atomStateMap = buildingBlocks[0] as Map<AnyAtom, AtomState>
  const result: string[] = []
  function printAtom(atom: AnyAtom, indent = 0) {
    const atomState = atomStateMap.get(atom)
    if (!atomState) return
    const prefix = '  '.repeat(indent)
    const label = atom.debugLabel || String(atom)
    const value = atomState?.v ?? 'undefined'
    result.push(`${prefix}${label}: v=${value}`)
    if (atomState?.d) {
      const deps = [...atomState.d.keys()]
      if (deps.length > 0) {
        deps.forEach((depAtom) => printAtom(depAtom, indent + 1))
      }
    }
  }
  Array.from(atomStateMap.keys(), (atom) => printAtom(atom))
  return result.join('\n')
}

export function trackAtomStateMap(store: Store) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[0] instanceof WeakMap) {
    throw new Error('Cannot print atomStateMap, store must be debug store')
  }
  const storeHooks = buildingBlocks[6]
  storeHooks.c!.add(undefined, (atom) => {
    console.log('ATOM_CHANGED', atom.debugLabel)
    console.log(printAtomState(store))
  })
  console.log(printAtomState(store))
}
