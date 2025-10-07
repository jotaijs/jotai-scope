import { render } from '@testing-library/react'
import type { PrimitiveAtom, WritableAtom } from 'jotai'
import { atom, useAtom } from 'jotai'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from '../../src'
import { createScope } from '../../src/ScopeProvider/scope'
import { AnyAtom } from '../../src/types'
import { clickButton, createDebugStore, getTextContents } from '../utils'

let baseAtom: PrimitiveAtom<number>

type WritableNumberAtom = WritableAtom<number, [number?], void>

const writableAtom: WritableNumberAtom = atom(0, (get, set, value = 0) => {
  const writableValue = get(writableAtom)
  const baseValue = get(baseAtom)
  set(writableAtom, writableValue + baseValue + value)
})
writableAtom.debugLabel = 'writableAtom'

const thisWritableAtom: WritableNumberAtom = atom(
  0,
  function write(this: WritableNumberAtom, get, set, value = 0) {
    set(this, get(this) + get(baseAtom) + value)
  }
)

function renderTest(targetAtom: WritableNumberAtom) {
  baseAtom = atom(0)
  baseAtom.debugLabel = 'baseAtom'

  function Component({ level }: { level: string }) {
    const [value, increaseWritable] = useAtom(targetAtom)
    const [baseValue, increaseBase] = useAtom(baseAtom)
    return (
      <div className={level}>
        <div className="read">{value}</div>
        <div className="readBase">{baseValue}</div>
        <button
          type="button"
          className="write"
          onClick={() => {
            increaseWritable()
          }}>
          increase writable atom
        </button>
        <button
          type="button"
          className="writeBase"
          onClick={() => increaseBase(level === 'level0' ? 1 : 10)}>
          increase scoped atom
        </button>
      </div>
    )
  }

  function App() {
    return (
      <>
        <h1>unscoped</h1>
        <Component level="level0" />
        <ScopeProvider atoms={[baseAtom]} name="level1">
          <h1>scoped</h1>
          <p>
            writable atom should update its value in both scoped and unscoped
            and read scoped atom
          </p>
          <Component level="level1" />
        </ScopeProvider>
      </>
    )
  }
  return render(<App />)
}

/*
writable=w(,w + s), base=b
S0[ ]: b0, w0(,w0 + b0)
S1[b]: b1, w0(,w0 + b1)
*/
describe('Self', () => {
  test.each(['writableAtom', 'thisWritableAtom'])(
    '%p updates its value in both scoped and unscoped and read scoped atom',
    (atomKey) => {
      const target =
        atomKey === 'writableAtom' ? writableAtom : thisWritableAtom
      const { container } = renderTest(target)

      const increaseLevel0BaseAtom = '.level0 .writeBase'
      const increaseLevel0Writable = '.level0 .write'
      const increaseLevel1BaseAtom = '.level1 .writeBase'
      const increaseLevel1Writable = '.level1 .write'

      const selectors = [
        '.level0 .readBase',
        '.level0 .read',
        '.level1 .readBase',
        '.level1 .read',
      ]

      // all initial values are zero
      expect(getTextContents(container, selectors)).toEqual([
        '0', // level0 readBase
        '0', // level0 read
        '0', // level1 readBase
        '0', // level1 read
      ])

      // level0 base atom updates its value to 1
      clickButton(container, increaseLevel0BaseAtom)
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '0', // level0 read
        '0', // level1 readBase
        '0', // level1 read
      ])

      // level0 writable atom increases its value, level1 writable atom shares the same value
      clickButton(container, increaseLevel0Writable)
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '0', // level1 readBase
        '1', // level1 read
      ])

      // level1 writable atom increases its value,
      // but since level1 base atom is zero,
      // level0 and level1 writable atoms value should not change
      clickButton(container, increaseLevel1Writable)
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '0', // level1 readBase
        '1', // level1 read
      ])

      // level1 base atom updates its value to 10
      clickButton(container, increaseLevel1BaseAtom)
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '10', // level1 readBase
        '1', // level1 read
      ])

      // level0 writable atom increases its value using level0 base atom
      clickButton(container, increaseLevel0Writable)
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '2', // level0 read
        '10', // level1 readBase
        '2', // level1 read
      ])

      // level1 writable atom increases its value using level1 base atom
      clickButton(container, increaseLevel1Writable)
      const v = getTextContents(container, selectors) + ''
      expect(v).toEqual(
        [
          '1', // level0 readBase
          '12', // level0 read
          '10', // level1 readBase
          '12', // level1 read
        ] + ''
      )
    }
  )
})

describe('scope chains', () => {
  const a = atom(0)
  const b = atom(null, (_, set, v: number) => set(a, v))
  const c = atom(null, (_, set, v: number) => set(b, v))
  a.debugLabel = 'a'
  b.debugLabel = 'b'
  c.debugLabel = 'c'
  function createScopes(atoms: AnyAtom[] = []) {
    const s0 = createDebugStore()
    const s1 = createScope({ atoms, parentStore: s0, name: 'S1' })
    return { s0, s1 }
  }
  test('S1[a]: a1, b0(,a1), c0(,b0(,a1))', () => {
    {
      const { s0, s1 } = createScopes([a])
      s0.set(c, 1)
      expect([s0.get(a), s1.get(a)] + '').toBe('1,0')
    }
    {
      const { s0, s1 } = createScopes([a])
      s1.set(c, 1)
      expect([s0.get(a), s1.get(a)] + '').toBe('0,1')
    }
  })
})
