import { expect, it } from 'vitest'
import type { AtomState } from 'src/ScopeProvider2/types'
import { atom, createStore } from '../../../jotai'
import { assertIsDevStore } from '../../ScopeProvider2/utils'

const store = createStore()
assertIsDevStore(store)
const stateMap = store.dev4_get_internal_weak_map()

const atomA = atom(0)
atomA.debugLabel = 'atomA'
const atomB = atom((get) => String(get(atomA)))
atomB.debugLabel = 'atomB'
let atomAState: AtomState
let atomBState: AtomState
let unsub: () => void

it('sets d when an atom has a consumer', () => {
  // atomB depends on atomA
  // atomB is a consumer of atomA
  // atomA is a producer for atomB

  store.get(atomB)

  atomAState = stateMap.get(atomA)!
  atomBState = stateMap.get(atomB)!
  /*
    AtomA state: { d: Map(0) {}, p: Set(0) {}, n: 1, v: 0 }

    AtomB state: {
      d: Map(1) { atomA => 1 },
      p: Set(0) {},
      n: 1,
      v: '0',
    }
  */
  expect(atomBState.d.has(atomA)).toBe(true)
})

it('mounts the atoms when an atom has a subscriber', () => {
  function onAUnmount() {}
  function onAMount() {
    return onAUnmount
  }
  atomA.onMount = onAMount

  function subscribeB() {}
  unsub = store.sub(atomB, subscribeB)

  /*
    AtomA state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 1,
      v: 0,
      m: {
        l: Set(0) {},
        d: Set(0) {},
        t: Set(1) { [atomB] }
        u: [Function onAUnmount]
      }
    }

    AtomB state: {
      d: Map(1) { atomA => 1 },
      p: Set(0) {},
      n: 1,
      v: '0',
      m: {
        l: Set(1) { [Function: subscribeB] },
        d: Set(1) { [atomA] },
        t: Set(0) {}
      }
    }
  */

  expect(atomBState.d.has(atomA)).toBe(true)
  expect(atomBState.m!.d.has(atomA)).toBe(true)
  expect(atomAState.m!.t.has(atomB)).toBe(true)
  expect(atomBState.m!.l.has(subscribeB)).toBe(true)
  expect(atomAState.m!.u!).toBe(onAUnmount)
  delete atomA.onMount
})

it('increments the epoch number when an atom is updated', () => {
  store.set(atomA, 1)

  /*
    AtomA state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 2,
      v: 1,
      m: {
        l: Set(0) {},
        d: Set(0) {},
        t: Set(1) { [atomB] }
        u: [Function onAUnmount]
      }
    }

    AtomB state: {
      d: Map(1) { atomA => 2 },
      p: Set(0) {},
      n: 2,
      v: '1',
      m: {
        l: Set(1) { [Function: subscribeB] },
        d: Set(1) { [atomA] },
        t: Set(0) {}
      }
    }
  */

  expect(atomAState.n).toBe(2)
  expect(atomBState.n).toBe(2)
  unsub()
})

it('unmounts the atoms when there are no subscribers', () => {
  /*
    AtomA state: { d: Map(0) {}, p: Set(0) {}, n: 2, v: 1 }

    AtomB state: {
      d: Map(1) { atomA => 2 },
      p: Set(0) {},
      n: 2,
      v: '1',
    }
  */
  expect(atomBState.m).toBeUndefined()
  expect(atomAState.m).toBeUndefined()
})

it('does not automatically increment the epoch number when the dependent is not mounted', () => {
  store.set(atomA, 2)

  /*
    AtomA state: { d: Map(0) {}, p: Set(0) {}, n: 3, v: 2 }

    AtomB state: {
      d: Map(1) { atomA => 2 },
      p: Set(0) {},
      n: 2,
      v: '1',
    }
  */

  expect(atomAState.n).toBe(3)
  expect(atomBState.n).toBe(2)
})

it('increments the epoch number when the dependent is read', () => {
  store.get(atomB)

  /*
    AtomA state: { d: Map(0) {}, p: Set(0) {}, n: 3, v: 2 }

    AtomB state: {
      d: Map(1) { atomA => 3 },
      p: Set(0) {},
      n: 3,
      v: '2',
    }
  */
  expect(atomBState.n).toBe(3)
})

it('increments the epoch number when the dependent is mounted', () => {
  store.set(atomA, 3)
  expect(atomAState.n).toBe(4)
  expect(atomBState.n).toBe(3)
  unsub = store.sub(atomB, function subscribeB() {})

  /*
    AtomA state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 4,
      v: 3,
      m: {
        l: Set(0) {},
        d: Set(0) {},
        t: Set(1) { [atomB] }
      }
    }

    AtomB state: {
      d: Map(1) { atomA => 4 },
      p: Set(0) {},
      n: 4,
      v: '3',
      m: {
        l: Set(1) { [Function: subscribeB] },
        d: Set(1) { [atomA] },
        t: Set(0) {}
      }
    }
  */
  expect(atomBState.n).toBe(4)
  unsub()
})

let resolve: (value: number) => void
const atomC = atom((get) => {
  get(atomB)
  return new Promise((r) => {
    resolve = r
  })
})
atomC.debugLabel = 'atomC'

it('sets p when an atom has a pending consumer', async () => {
  store.get(atomC)
  stateMap.get(atomC)!

  const unsubA = store.sub(atomA, function subscribeA() {})
  const unsubB = store.sub(atomB, function subscribeB() {})
  const unsubC = store.sub(atomC, function subscribeC() {})

  /*
    AtomA state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 4,
      v: 3,
      m: {
        l: Set(1) { [Function: subscribeA] },
        d: Set(0) {},
        t: Set(1) { [atomB] }
      }
    }

    AtomB state: {
      d: Map(1) { atomA => 4 },
      p: Set(1) { [atomC] },
      n: 4,
      v: '3',
      m: {
        l: Set(1) { [Function: subscribeB] },
        d: Set(1) { [atomA] },
        t: Set(1) { [atomC] }
      }
    }

    AtomC state: {
      d: Map(1) { atomB => 4 },
      p: Set(0) {},
      n: 1,
      v: Promise { <pending>, onCancel: [Function (anonymous)] },
      m: {
        l: Set(1) { [Function: subscribeC] },
        d: Set(1) { [atomB] },
        t: Set(0) {}
      }
    }
  */
  expect(atomBState.p.has(atomC)).toBe(true)

  resolve(0)
  await 'microtask'

  /*
    AtomA state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 4,
      v: 3,
      m: {
        l: Set(1) { [Function: subscribeA] },
        d: Set(0) {},
        t: Set(1) { [atomB] }
      }
    }

    AtomB state: {
      d: Map(1) { atomA => 4},
      p: Set(0) {},
      n: 4,
      v: '3',
      m: {
        l: Set(1) { [Function: subscribeB] },
        d: Set(1) { [atomA] },
        t: Set(1) { [atomC] }
      }
    }

    AtomC state: {
      d: Map(1) { atomB => 4 },
      p: Set(0) {},
      n: 1,
      v: Promise { 0, onCancel: [Function (anonymous)] },
      m: {
        l: Set(1) { [Function: subscribeC] },
        d: Set(1) { [atomB] },
        t: Set(0) {}
      }
    }
  */
  unsubA()
  unsubB()
  unsubC()
})

it('sets e when an atom throws an error', () => {
  const atomD = atom(() => {
    throw new Error('error')
  })
  atomD.debugLabel = 'atomD'
  try {
    store.get(atomD)
  } catch {
    // ignore
  }
  const atomDState = stateMap.get(atomD)!

  /*
    AtomD state: {
      d: Map(0) {},
      p: Set(0) {},
      n: 1,
      e: Error: error
          at ...
    }
  */
  expect(atomDState.e).toBeInstanceOf(Error)
})
