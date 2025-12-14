import { atom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import { describe, expect, test, vi } from 'vitest'
import { createScope } from 'jotai-scope'

describe('building blocks', () => {
  test('should patch storeHooks to translate atoms to scoped versions', () => {
    const baseStore = buildStore()
    const a = atom(0)
    a.debugLabel = 'a'

    // Create scope with atom 'a' scoped
    const scopedStore = createScope({ parentStore: baseStore, atoms: [a] })

    // Get building blocks and initialize hooks
    const buildingBlocks = getBuildingBlocks(scopedStore)
    const storeHooks = initializeStoreHooks(buildingBlocks[6])
    expect(Object.keys(buildingBlocks[6]).join('')).toEqual('frcmui')

    // Get the base store's hooks to spy on what actually gets registered
    const baseBuildingBlocks = getBuildingBlocks(baseStore)
    const baseStoreHooks = initializeStoreHooks(baseBuildingBlocks[6])

    // Track what atom the BASE hook receives (after translation)
    const registeredAtoms: unknown[] = []
    const originalBaseAdd = baseStoreHooks.c!.add.bind(baseStoreHooks.c!)
    baseStoreHooks.c!.add = function (atom, callback) {
      registeredAtoms.push(atom)
      return originalBaseAdd(atom as undefined, callback)
    }

    // Register a hook for atom 'a' using the SCOPED storeHooks
    const callback = vi.fn()
    storeHooks.c!.add(a, callback)

    // The scoped storeHooks should translate 'a' to scoped version before
    // calling the base store's hooks
    expect(registeredAtoms.length).toBe(1)
    const registeredAtom = registeredAtoms[0] as typeof a
    expect(registeredAtom).not.toBe(a)
    expect(registeredAtom.debugLabel).toMatch(/a/)
  })

  test('should call hooks with scoped atom when atom changes', () => {
    const baseStore = buildStore()
    const a = atom(0)
    a.debugLabel = 'a'

    // Create scope with atom 'a' scoped
    const scopedStore = createScope({ parentStore: baseStore, atoms: [a] })

    // Subscribe to trigger mount
    scopedStore.sub(a, () => {})

    // Get building blocks and initialize hooks
    const buildingBlocks = getBuildingBlocks(scopedStore)
    const storeHooks = initializeStoreHooks(buildingBlocks[6])

    // Register a change hook for atom 'a'
    const changedAtoms: unknown[] = []
    storeHooks.c!.add(a, () => {
      changedAtoms.push('called')
    })

    // Set the atom value through the scoped store
    scopedStore.set(a, 1)

    // The hook should have been called
    expect(changedAtoms.length).toBeGreaterThan(0)
  })
})
