import type { AtomState, Store } from 'src/ScopeProvider2/types'
import { atom, createStore, type Getter, type Setter } from 'jotai'
import { assertIsDevStore, WithJestMock } from '../../ScopeProvider2/utils'

type AtomStateWithLabel = AtomState & { label?: string }
type DeriveCallack = Parameters<Store['unstable_derive']>[0]
type GetAtomState = ReturnType<DeriveCallack>[0]
type AtomReadTrap = ReturnType<DeriveCallack>[1]
type AtomWriteTrap = ReturnType<DeriveCallack>[2]

let getAtomState: WithJestMock<GetAtomState>
let atomReadTrap: WithJestMock<AtomReadTrap>
let atomWriteTrap: WithJestMock<AtomWriteTrap>

function getJotaiStack() {
  return new Error()
    .stack!.split('\n')
    .filter((s) => s.match(/\/jotai\/|\/__tests__\//))
    .map((s) => s.trim())
    .slice(2)
    .reverse()
    .join('\n')
}
let callNo = 0
const deriveCallback: DeriveCallack = jest.fn((baseGetAtomState) => {
  getAtomState = jest.fn((atom, originalAtomState) => {
    console.log(++callNo, getJotaiStack())
    return baseGetAtomState<any>(atom, originalAtomState)
  })
  atomReadTrap = jest.fn((atom, getter, options) => {
    const atomReadGetter: any = jest.fn((a) => getter(a))
    atomReadGetterMap.set(getter, atomReadGetter)
    return atom.read(atomReadGetter as Getter, options)
  }) as any
  atomWriteTrap = jest.fn((atom, getter, setter, ...params) => {
    const atomWriteGetter: any = jest.fn((a) => getter(a))
    const atomWriteSetter: any = jest.fn((a, ...v) => setter(a, ...v))
    atomWriteGetterMap.set(getter, atomWriteGetter)
    atomWriteSetterMap.set(setter, atomWriteSetter)
    return atom.write(atomWriteGetter as Getter, atomWriteSetter as Setter, ...params)
  }) as any
  return [getAtomState, atomReadTrap, atomWriteTrap]
})
const store = createStore().unstable_derive(deriveCallback)
assertIsDevStore(store)
const stateMap = store.dev4_get_internal_weak_map()

let atomReadGetterMap = new Map<Getter, WithJestMock<Getter>>()
let atomWriteGetterMap = new Map<Getter, WithJestMock<Getter>>()
let atomWriteSetterMap = new Map<Setter, WithJestMock<Setter>>()

describe('calls GAS and accessor traps on', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    atomReadGetterMap.clear()
    atomWriteGetterMap.clear()
    atomWriteSetterMap.clear()
  })

  const atomA = atom(0)
  atomA.debugLabel = 'atomA'
  const atomB = atom(
    (get) => get(atomA),
    (get, set, value: number) => {
      get(atomA)
      set(atomA, value)
      get(atomA)
    },
  )
  atomB.debugLabel = 'atomB'
  const atomC = atom(
    (get) => get(atomB),
    (get, set, value: number) => {
      get(atomB)
      set(atomB, value)
      get(atomB)
    },
  )
  atomC.debugLabel = 'atomC'
  const [atomAState, atomBState, atomCState] = [atomA, atomB, atomC].map((a) => {
    store.get(a)
    const atomState = stateMap.get(a)! as AtomStateWithLabel
    atomState.label = atomA.debugLabel!
    return atomState
  })
  it('nested atom read and write', () => {
    store.get(atomC)
    expect(getAtomState).nthCalledWith(1, atomC)
    expect(getAtomState).nthCalledWith(2, atomB, atomCState)
    expect(getAtomState).nthCalledWith(3, atomA, atomBState)
  })
})
