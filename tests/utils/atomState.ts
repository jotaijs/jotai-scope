import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_BuildingBlocks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { createDiffer } from './diff'
import { leftpad } from './leftpad'

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<INTERNAL_BuildingBlocks>

const atomStateDiffer = createDiffer()

function _printAtomState(store: Store) {
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

type PrintAtomStateFn = {
  (store: Store): string
  diff: (store: Store) => string
  clearDiff: () => void
}

export const printAtomState: PrintAtomStateFn = Object.assign((store: Store) => _printAtomState(store), {
  diff: (store: Store) => atomStateDiffer(_printAtomState(store)),
  clearDiff: () => {
    atomStateDiffer.previous = null
  },
})

export function trackAtomStateMap([store]: [Store, ...Store[]]) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[0] instanceof WeakMap) {
    throw new Error('Cannot print atomStateMap, store must be debug store')
  }
  const storeHooks = buildingBlocks[6]

  storeHooks.c!.add(undefined, (atom) => {
    console.log('ATOM_CHANGED', atom.debugLabel)
    console.log(leftpad(printAtomState.diff(store)))
  })
}

type TreeNode = { text: string; children: TreeNode[] }
type Frame = { level: number; children: TreeNode[] }

function sortIndented(input: string, indentWidth = 2): string {
  function toLines(s: string): string[] {
    const out: string[] = []
    for (const raw of s.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (line.trim().length) out.push(line)
    }
    return out
  }

  function indentLevel(line: string): { level: number; rest: string } {
    let i = 0,
      spaces = 0,
      tabs = 0
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
      if (line[i] === ' ') spaces++
      else tabs++
      i++
    }
    return { level: tabs + Math.floor(spaces / indentWidth), rest: line.slice(i).trimEnd() }
  }

  function toTree(s: string): TreeNode[] {
    const roots: TreeNode[] = []
    const stack: Frame[] = [{ level: -1, children: roots }]
    for (const L of toLines(s)) {
      const { level, rest } = indentLevel(L)
      const node: TreeNode = { text: rest, children: [] }
      while (stack[stack.length - 1].level >= level) stack.pop()
      stack[stack.length - 1].children.push(node)
      stack.push({ level, children: node.children })
    }
    return roots
  }

  function sortTree(nodes: TreeNode[]): void {
    nodes.sort((a, b) => a.text.trim().localeCompare(b.text.trim(), undefined, { numeric: true, sensitivity: 'base' }))
    for (const n of nodes) sortTree(n.children)
  }

  function flatten(nodes: TreeNode[], depth = 0): string[] {
    const out: string[] = []
    for (const n of nodes) {
      out.push(' '.repeat(indentWidth * depth) + n.text)
      out.push(...flatten(n.children, depth + 1))
    }
    return out
  }

  const tree = toTree(input)
  sortTree(tree)
  return flatten(tree).join('\n')
}

/** sorts the keys but preserves the indentation hierarchy */
export function printSortedAtomState(store: Store) {
  const raw = printAtomState(store)
  return sortIndented(raw)
}
