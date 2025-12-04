import chalk from 'chalk'
import type { INTERNAL_Mounted as Mounted, INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { createDiffer } from './diff'

const mountedDiffer = createDiffer()

type MountedChangeEvent = 'l' | 'd' | 't' | 'u'
type MountedChangeCallback = (event: MountedChangeEvent, atom: AnyAtom, mounted: Mounted) => void

function createMountedWrapper(atom: AnyAtom, mounted: Mounted, onChange: MountedChangeCallback): Mounted {
  // Wrap the original Set's methods to track changes
  // This modifies the original Set in place, so changes are reflected everywhere
  function wrapSet<T>(original: Set<T>, event: MountedChangeEvent): Set<T> {
    const originalAdd = original.add.bind(original)
    const originalDelete = original.delete.bind(original)
    const originalClear = original.clear.bind(original)
    original.add = function (value: T) {
      const result = originalAdd(value)
      onChange(event, atom, wrappedMounted)
      return result
    }
    original.delete = function (value: T) {
      const result = originalDelete(value)
      onChange(event, atom, wrappedMounted)
      return result
    }
    original.clear = function () {
      originalClear()
      onChange(event, atom, wrappedMounted)
    }
    return original
  }

  const wrappedL = wrapSet(mounted.l, 'l')
  const wrappedD = wrapSet(mounted.d, 'd')
  const wrappedT = wrapSet(mounted.t, 't')

  let currentU = mounted.u
  const wrappedMounted: Mounted = {
    get l() {
      return wrappedL
    },
    get d() {
      return wrappedD
    },
    get t() {
      return wrappedT
    },
    get u() {
      return currentU
    },
    set u(value: (() => void) | undefined) {
      currentU = value
      onChange('u', atom, wrappedMounted)
    },
  }

  return wrappedMounted
}

// Store a reference to the mounted map for debugging
let lastMountedMap: Map<AnyAtom, Mounted> | null = null

function _printMountedMap(store: Store, highlightAtom?: AnyAtom, highlightField?: MountedChangeEvent) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[1] instanceof WeakMap) {
    throw new Error('Cannot print mountedMap, store must be debug store')
  }
  const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
  if (lastMountedMap && lastMountedMap !== mountedMap) {
    console.log('  [printMountedMap] WARNING: mountedMap changed!')
  }
  lastMountedMap = mountedMap
  const result: string[] = []

  function formatItem(item: unknown): string {
    if (typeof item === 'function') {
      return item.name || 'Anonymous'
    }
    return String(item)
  }

  function formatSet(set: Set<unknown>, isBold: boolean): string {
    const items = set.size === 0 ? 'undefined' : Array.from(set, formatItem).join(',')
    return isBold ? chalk.bold(items) : items
  }

  // Store a reference to the c@S1 mounted object for debugging
  let cS1Mounted: Mounted | null = null

  function printAtom(atom: AnyAtom) {
    const mounted = mountedMap.get(atom)
    if (!mounted) return
    const label = atom.debugLabel || String(atom)
    // Debug: check if this is c@S1
    if (label === 'c@S1') {
      console.log('  [printAtom] c@S1 called')
      const scopeL = (globalThis as any).__scopeFromMountedL
      const scopeMounted = (globalThis as any).__scopeFromMounted
      const scopeMountedMap = (globalThis as any).__scopeMountedMap
      const scopeFromAtom = (globalThis as any).__scopeFromAtom
      console.log(
        '  [printMountedMap] c@S1 mounted.l:',
        [...mounted.l].map((l: any) => l.name),
        'mounted.l.size:',
        mounted.l.size,
        'scopeL defined:',
        scopeL !== undefined,
        'mounted.l === scopeL:',
        mounted.l === scopeL,
        'scopeL?.size:',
        scopeL?.size,
        'mounted === scopeMounted:',
        mounted === scopeMounted,
        'atom === scopeFromAtom:',
        atom === scopeFromAtom,
        'scopeFromAtom?.debugLabel:',
        scopeFromAtom?.debugLabel
      )
    }
    const isHighlighted = atom === highlightAtom
    const l = formatSet(mounted.l, isHighlighted && highlightField === 'l')
    const d = formatSet(mounted.d, isHighlighted && highlightField === 'd')
    const t = formatSet(mounted.t, isHighlighted && highlightField === 't')
    result.push(`${label}: l=${l} d=${d} t=${t}`)
  }
  // Debug: count atoms with debugLabel 'c@S1'
  const cS1Atoms = Array.from(mountedMap.keys()).filter((a) => a.debugLabel === 'c@S1')
  const scopeFromAtom = (globalThis as any).__scopeFromAtom
  const scopeMountedMap = (globalThis as any).__scopeMountedMap
  if (scopeFromAtom?.debugLabel === 'c@S1') {
    console.log('  [printMountedMap] c@S1 atoms in mountedMap:', cS1Atoms.length)
    console.log('  [printMountedMap] scopeFromAtom in mountedMap:', mountedMap.has(scopeFromAtom))
    console.log('  [printMountedMap] mountedMap === scopeMountedMap:', mountedMap === scopeMountedMap)
    console.log('  [printMountedMap] scopeFromAtom in scopeMountedMap:', scopeMountedMap?.has(scopeFromAtom))
    if (cS1Atoms.length > 0) {
      console.log('  [printMountedMap] cS1Atoms[0] === scopeFromAtom:', cS1Atoms[0] === scopeFromAtom)
    }
  }
  Array.from(mountedMap.keys(), printAtom)
  return result.join('\n')
}

type PrintMountedMapFn = {
  (store: Store, highlightAtom?: AnyAtom, highlightField?: MountedChangeEvent): string
  diff: (store: Store) => string
  clearDiff: () => void
}

export const printMountedMap: PrintMountedMapFn = Object.assign(
  (store: Store, highlightAtom?: AnyAtom, highlightField?: MountedChangeEvent) =>
    _printMountedMap(store, highlightAtom, highlightField),
  {
    diff: (store: Store) => mountedDiffer(_printMountedMap(store)),
    clearDiff: () => {
      mountedDiffer.previous = null
    },
  }
)

export function trackMountedMap(store: Store) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[1] instanceof WeakMap) {
    throw new Error('Cannot print mountedMap, store must be debug store')
  }
  const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
  const storeHooks = buildingBlocks[6]

  function printDiff(header: string) {
    console.log(header)
    console.log(printMountedMap.diff(store))
  }

  const onChange: MountedChangeCallback = (event, atom, _mounted) => {
    printDiff(`MOUNTED_${event.toUpperCase()}_CHANGED ${atom.debugLabel}`)
  }

  storeHooks.m!.add(undefined, (atom) => {
    const mounted = mountedMap.get(atom)
    if (mounted) {
      const wrappedMounted = createMountedWrapper(atom, mounted, onChange)
      mountedMap.set(atom, wrappedMounted)
      printDiff(`MOUNTED ${atom.debugLabel}`)
    }
  })
  storeHooks.u!.add(undefined, (atom) => {
    printDiff(`UNMOUNTED ${atom.debugLabel}`)
  })
}
