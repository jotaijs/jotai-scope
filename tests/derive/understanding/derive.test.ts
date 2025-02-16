import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtomState } from 'src/ScopeProvider2/types'
import {
  type Getter,
  type SetStateAction,
  type Setter,
  atom,
} from '../../../jotai'
import { createStore } from '../../protoStore'
import {
  PrdStore,
  WithJestMock,
  assertIsDevStore,
} from '../../ScopeProvider2/utils'

type Store = ReturnType<typeof createStore>
type AtomStateWithLabel = AtomState & { label?: string }
type DeriveCallack = Parameters<Store['unstable_derive']>[0]
type GetAtomState = ReturnType<DeriveCallack>[0]
type AtomReadTrap = ReturnType<DeriveCallack>[1]
type AtomWriteTrap = ReturnType<DeriveCallack>[2]

let getAtomState: GetAtomState
let atomReadTrap: WithJestMock<AtomReadTrap>
let atomWriteTrap: WithJestMock<AtomWriteTrap>

const deriveCallback: DeriveCallack = vi.fn((baseGetAtomState) => {
  getAtomState = vi.fn((atom, originAtom) => {
    return baseGetAtomState(atom, originAtom)
  })
  atomReadTrap = vi.fn((atom, getter, options) => {
    const atomReadGetter: any = vi.fn((a) => getter(a))
    atomReadGetterMap.set(getter, atomReadGetter)
    return atom.read(atomReadGetter as Getter, options)
  }) as any
  atomWriteTrap = vi.fn((atom, getter, setter, ...params) => {
    const atomWriteGetter: any = vi.fn((a) => getter(a))
    const atomWriteSetter: any = vi.fn((a, ...v) => setter(a, ...v))
    atomWriteGetterMap.set(getter, atomWriteGetter)
    atomWriteSetterMap.set(setter, atomWriteSetter)
    return atom.write(
      atomWriteGetter as Getter,
      atomWriteSetter as Setter,
      ...params
    )
  }) as any
  return [getAtomState, atomReadTrap, atomWriteTrap]
})
const store = createStore().unstable_derive(deriveCallback) as PrdStore
assertIsDevStore(store)
const stateMap = store.dev4_get_internal_weak_map()

const atomReadGetterMap = new Map<Getter, WithJestMock<Getter>>()
const atomWriteGetterMap = new Map<Getter, WithJestMock<Getter>>()
const atomWriteSetterMap = new Map<Setter, WithJestMock<Setter>>()
function nthReadParams(nthCall: number, guessParams: any[] = []) {
  return Object.assign(
    [],
    atomReadTrap.mock.calls[nthCall - 1]!.slice(),
    guessParams
  )
}
function nthWriteParams(nthCall: number, guessParams: any[] = []) {
  return Object.assign(
    [],
    atomWriteTrap.mock.calls[nthCall - 1]!.slice(),
    guessParams
  )
}
function getAccessor<T, V>(
  map: Map<T, T & V>,
  trap: { mock: { calls: Array<[any, any, any, ...rest: any[]]> } },
  paramIndex: number
) {
  return (nthCall: number) =>
    map.get(trap.mock.calls[nthCall - 1]![paramIndex])!
}
const nthAtomReadGetter = getAccessor(atomReadGetterMap, atomReadTrap!, 1)
const nthAtomWriteGetter = getAccessor(atomWriteGetterMap, atomWriteTrap!, 1)
const nthAtomWriteSetter = getAccessor(atomWriteSetterMap, atomWriteTrap!, 2)

const atomA = atom(0)
atomA.debugLabel = 'atomA'
const atomB = atom((get) => String(get(atomA)))
atomB.debugLabel = 'atomB'
const atomC = atom(null, (_get, set, value: SetStateAction<number>) => {
  set(atomA, value)
})
atomC.debugLabel = 'atomC'
let resolve: (value: unknown) => void
const atomD = atom((get) => {
  get(atomA)
  return new Promise((r) => {
    resolve = r
  })
})
atomD.debugLabel = 'atomD'
const atomE = atom<void, [], void>(
  (_get, { setSelf }) => {
    Promise.resolve().then(() => {
      setSelf()
    })
  },
  (_get, _set) => {}
)
atomE.debugLabel = 'atomE'

let atomAState: AtomStateWithLabel
let atomBState: AtomStateWithLabel
let atomCState: AtomStateWithLabel
let atomDState: AtomStateWithLabel
let atomState: AtomStateWithLabel

function increment(v: number) {
  return v + 1
}

describe('calls GAS and accessor traps on', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    atomReadGetterMap.clear()
    atomWriteGetterMap.clear()
    atomWriteSetterMap.clear()
  })

  it('first store.get(primitiveAtom)', () => {
    store.get(atomA)
    expect(getAtomState).toHaveBeenCalledTimes(2)
    atomAState = stateMap.get(atomA)!
    atomAState.label = atomA.debugLabel!
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(getAtomState).nthCalledWith(2, atomA, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomA])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomA)
  })

  it('store.get(primitiveAtom)', () => {
    store.get(atomA)
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(0) // atomRead is cached
  })

  it('initial store.get(derivedAtom)', () => {
    store.get(atomB)
    expect(getAtomState).toHaveBeenCalledTimes(2)
    atomBState = stateMap.get(atomB)!
    atomBState.label = atomB.debugLabel!
    expect(getAtomState).nthCalledWith(1, atomB)
    expect(getAtomState).nthCalledWith(2, atomA, atomB)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomB])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomA)
  })

  it('store.get(derivedAtom)', () => {
    store.get(atomB)
    expect(getAtomState).toHaveBeenCalledTimes(2)
    expect(getAtomState).nthCalledWith(1, atomB)
    expect(getAtomState).nthCalledWith(2, atomA, atomB)

    expect(atomReadTrap).toHaveBeenCalledTimes(0) // atomRead is cached
  })

  it('store.get(asyncDerivedAtom)', async () => {
    store.get(atomD)
    expect(getAtomState).toHaveBeenCalledTimes(3)

    atomDState = stateMap.get(atomD)!
    atomDState.label = atomD.debugLabel!
    expect(getAtomState).nthCalledWith(1, atomD)
    expect(getAtomState).nthCalledWith(2, atomA, atomD)
    expect(getAtomState).nthCalledWith(3, atomA, atomD)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomD])
    )
    vi.clearAllMocks()
    resolve(1)
    await 'microtask'
    // does not call GAS or atomRead when promise resolves
    expect(getAtomState).toHaveBeenCalledTimes(0)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('store.set(primitiveAtom, value)', () => {
    store.set(atomA, 1)
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(1)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomA, , , 1])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, 1)
  })

  it('store.set(primitiveAtom, (currValue) => nextValue)', () => {
    store.set(atomA, increment)
    expect(getAtomState).toHaveBeenCalledTimes(2)
    expect(getAtomState).nthCalledWith(1, atomA, atomA)
    expect(getAtomState).nthCalledWith(2, atomA, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(1)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomA, , , increment])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledWith(atomA)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, 2)
  })

  it('store.set(writableAtom, value)', () => {
    store.set(atomC, 3)
    expect(getAtomState).toHaveBeenCalledTimes(2)
    store.get(atomC)
    atomCState = stateMap.get(atomC)!
    atomCState.label = atomC.debugLabel!
    expect(getAtomState).nthCalledWith(1, atomA, atomC)
    expect(getAtomState).nthCalledWith(2, atomA, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomC])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomC)
    expect(atomWriteTrap).toHaveBeenCalledTimes(2)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomC, , , 3])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, 3)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      2,
      ...nthWriteParams(2, [atomA, , , 3])
    )
    expect(nthAtomWriteGetter(2)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledWith(atomA, 3)
  })

  it('store.set(writableAtom, currValue => nextValue)', () => {
    store.set(atomC, increment)
    expect(getAtomState).toHaveBeenCalledTimes(3)
    expect(getAtomState).nthCalledWith(1, atomA, atomC)
    expect(getAtomState).nthCalledWith(2, atomA, atomA)
    expect(getAtomState).nthCalledWith(3, atomA, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(2)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomC, , , increment])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, increment)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      2,
      ...nthWriteParams(2, [atomA, , , increment])
    )
    expect(nthAtomWriteGetter(2)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteGetter(2)).toHaveBeenCalledWith(atomA)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledWith(atomA, 4)
  })

  it('store.sub(primativeAtom, () => {})', () => {
    const unsubA = store.sub(atomA, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)

    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('store.sub(derivedAtom, () => {})', () => {
    const unsubB = store.sub(atomB, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(4)
    expect(getAtomState).nthCalledWith(1, atomB)
    expect(getAtomState).nthCalledWith(2, atomA, atomB)
    expect(getAtomState).nthCalledWith(3, atomA, atomB)
    expect(getAtomState).nthCalledWith(4, atomA, atomB)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomB])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomA)
    unsubB()
    expect(getAtomState).toHaveBeenCalledTimes(6)
    expect(getAtomState).nthCalledWith(1, atomB)
    expect(getAtomState).nthCalledWith(2, atomA, atomB)
    expect(getAtomState).nthCalledWith(3, atomA, atomB)
    expect(getAtomState).nthCalledWith(4, atomA, atomB)
    expect(getAtomState).nthCalledWith(5, atomA, atomB)
    expect(getAtomState).nthCalledWith(6, atomB, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomB])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomA)
  })

  it('store.sub(writableAtom, () => {})', () => {
    const unsubC = store.sub(atomC, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomC)

    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    unsubC()
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomC)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomA unmount', () => {
    const unsubA = store.sub(atomA, () => {})
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomA unmount when atomB is still mounted', () => {
    const unsubA = store.sub(atomA, () => {})
    const unsubB = store.sub(atomB, () => {})
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(5)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(getAtomState).nthCalledWith(2, atomB)
    expect(getAtomState).nthCalledWith(3, atomA, atomB)
    expect(getAtomState).nthCalledWith(4, atomA, atomB)
    expect(getAtomState).nthCalledWith(5, atomB, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    unsubB()
    expect(getAtomState).toHaveBeenCalledTimes(2)
    expect(getAtomState).nthCalledWith(1, atomA, atomB)
    expect(getAtomState).nthCalledWith(2, atomB, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomB unmount', () => {
    const unsubB = store.sub(atomB, () => {})
    unsubB()
    expect(getAtomState).toHaveBeenCalledTimes(5)
    expect(getAtomState).nthCalledWith(1, atomB)
    expect(getAtomState).nthCalledWith(2, atomA, atomB)
    expect(getAtomState).nthCalledWith(3, atomA, atomB)
    expect(getAtomState).nthCalledWith(4, atomA, atomB)
    expect(getAtomState).nthCalledWith(5, atomB, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomB unmount when atomA is still mounted', () => {
    const unsubA = store.sub(atomA, () => {})
    const unsubB = store.sub(atomB, () => {})
    unsubB()
    expect(getAtomState).toHaveBeenCalledTimes(5)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(getAtomState).nthCalledWith(2, atomB)
    expect(getAtomState).nthCalledWith(3, atomA, atomB)
    expect(getAtomState).nthCalledWith(4, atomA, atomB)
    expect(getAtomState).nthCalledWith(5, atomA, atomB)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(0)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomC unmount', () => {
    const unsubC = store.sub(atomC, () => {})
    unsubC()
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomC)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
  })

  it('atomA mount setSelf', () => {
    atomA.onMount = () => {}
    let unsubA = store.sub(atomA, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(0)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    atomA.onMount = (setSelf) => {
      setSelf(-1)
      return () => {}
    }
    unsubA = store.sub(atomA, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(2)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(getAtomState).nthCalledWith(2, atomA, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(1)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomA, , , -1])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, -1)
    vi.clearAllMocks()
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(0)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    atomA.onMount = (setSelf) => {
      return () => setSelf(-1)
    }
    unsubA = store.sub(atomA, () => {})
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(0)
    vi.clearAllMocks()
    unsubA()
    expect(getAtomState).toHaveBeenCalledTimes(1)
    expect(getAtomState).nthCalledWith(1, atomA, atomA)
    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(1)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomA, , , -1])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomA, -1)
  })

  it('setSelf', async () => {
    store.get(atomE)
    await 'microtask'
    expect(getAtomState).toHaveBeenCalledTimes(1)
    atomState = stateMap.get(atomE)!
    atomState.label = atomE.debugLabel!
    expect(getAtomState).nthCalledWith(1, atomE)

    expect(atomReadTrap).toHaveBeenCalledTimes(1)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomE])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(0)
  })

  const atomF = atom(0)
  atomF.debugLabel = 'atomF'
  const atomG = atom(
    (get) => get(atomF),
    (_get, set, value: number) => {
      set(atomF, value)
    }
  )
  atomG.debugLabel = 'atomG'
  const atomH = atom(
    (get) => get(atomG),
    (_get, set, value: number) => {
      set(atomG, value)
    }
  )
  atomH.debugLabel = 'atomH'
  let atomFState: AtomStateWithLabel
  let atomGState: AtomStateWithLabel
  let atomHState: AtomStateWithLabel
  it('nested atom read and write', () => {
    store.get(atomH)
    atomFState = stateMap.get(atomF)!
    atomFState.label = atomF.debugLabel!
    atomGState = stateMap.get(atomG)!
    atomGState.label = atomG.debugLabel!
    atomHState = stateMap.get(atomH)!
    atomHState.label = atomH.debugLabel!

    expect(getAtomState).toHaveBeenCalledTimes(7)
    expect(getAtomState).nthCalledWith(1, atomH)
    expect(getAtomState).nthCalledWith(2, atomG, atomH)
    expect(getAtomState).nthCalledWith(3, atomF, atomG)
    expect(getAtomState).nthCalledWith(4, atomF, atomF)
    expect(getAtomState).nthCalledWith(5, atomF)
    expect(getAtomState).nthCalledWith(6, atomG)
    expect(getAtomState).nthCalledWith(7, atomH)

    expect(atomReadTrap).toHaveBeenCalledTimes(3)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      1,
      ...nthReadParams(1, [atomH])
    )
    expect(nthAtomReadGetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(1)).toHaveBeenCalledWith(atomG)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      2,
      ...nthReadParams(2, [atomG])
    )
    expect(nthAtomReadGetter(2)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(2)).toHaveBeenCalledWith(atomF)
    expect(atomReadTrap).toHaveBeenNthCalledWith(
      3,
      ...nthReadParams(3, [atomF])
    )
    expect(nthAtomReadGetter(3)).toHaveBeenCalledTimes(1)
    expect(nthAtomReadGetter(3)).toHaveBeenCalledWith(atomF)

    vi.clearAllMocks()
    store.set(atomH, 0)
    expect(getAtomState).toHaveBeenCalledTimes(3)
    expect(getAtomState).nthCalledWith(1, atomG, atomH)
    expect(getAtomState).nthCalledWith(2, atomF, atomG)
    expect(getAtomState).nthCalledWith(3, atomF, atomF)

    expect(atomReadTrap).toHaveBeenCalledTimes(0)
    expect(atomWriteTrap).toHaveBeenCalledTimes(3)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      1,
      ...nthWriteParams(1, [atomH, , , 0])
    )
    expect(nthAtomWriteGetter(1)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(1)).toHaveBeenCalledWith(atomG, 0)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      2,
      ...nthWriteParams(2, [atomG, , , 0])
    )
    expect(nthAtomWriteGetter(2)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(2)).toHaveBeenCalledWith(atomF, 0)
    expect(atomWriteTrap).toHaveBeenNthCalledWith(
      3,
      ...nthWriteParams(3, [atomF, , , 0])
    )
    expect(nthAtomWriteGetter(3)).toHaveBeenCalledTimes(0)
    expect(nthAtomWriteSetter(3)).toHaveBeenCalledTimes(1)
    expect(nthAtomWriteSetter(3)).toHaveBeenCalledWith(atomF, 0)
  })
})
