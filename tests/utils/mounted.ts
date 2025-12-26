import type { INTERNAL_Mounted as Mounted, INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { createDiffer } from './diff'

const mountedDiffer = createDiffer()

type MountedChangeEvent = 'l' | 'd' | 't' | 'u'
type MountedChangeCallback = (event: MountedChangeEvent, atom: AnyAtom, mounted: Mounted) => void

function createMountedWrapper(atom: AnyAtom, mounted: Mounted, onChange: MountedChangeCallback): Mounted {
  function wrapSet<T>(original: Set<T>, event: MountedChangeEvent): Set<T> {
    const wrapped = new Set(original)
    const originalAdd = wrapped.add.bind(wrapped)
    const originalDelete = wrapped.delete.bind(wrapped)
    const originalClear = wrapped.clear.bind(wrapped)
    wrapped.add = function (value: T) {
      const result = originalAdd(value)
      onChange(event, atom, wrappedMounted)
      return result
    }
    wrapped.delete = function (value: T) {
      const result = originalDelete(value)
      onChange(event, atom, wrappedMounted)
      return result
    }
    wrapped.clear = function () {
      originalClear()
      onChange(event, atom, wrappedMounted)
    }
    return wrapped
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

function _printMountedMap(store: Store) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[1] instanceof WeakMap) {
    throw new Error('Cannot print mountedMap, store must be debug store')
  }
  const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
  const result: string[] = []

  function formatItem(item: AnyAtom | (() => void)): string {
    if (typeof item === 'function') {
      return item.name || 'Anonymous'
    }
    return item.debugLabel?.replace(/->\S+\d+/, '') ?? String(item)
  }

  function formatSet(set: Set<AnyAtom> | Set<() => void>) {
    return set.size === 0 ? '[]' : Array.from(set, formatItem)
  }

  function printAtom(atom: AnyAtom) {
    const mounted = mountedMap.get(atom)
    if (!mounted) return
    const label = atom.debugLabel || String(atom)
    const l = formatSet(mounted.l)
    const d = formatSet(mounted.d)
    const t = formatSet(mounted.t)
    result.push(`${label}: l=${l} d=${d} t=${t}`)
  }
  Array.from(mountedMap.keys(), printAtom)
  return result.join('\n')
}

type PrintMountedMapFn = {
  (store: Store): string
  diff: (store: Store) => string
  clearDiff: () => void
}

export const printMountedMap: PrintMountedMapFn = Object.assign((store: Store) => _printMountedMap(store), {
  diff: (store: Store) => mountedDiffer(_printMountedMap(store)),
  clearDiff: () => {
    mountedDiffer.previous = null
  },
})

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
