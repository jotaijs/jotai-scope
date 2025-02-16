import { fireEvent } from '@testing-library/react'
import { Mock, vi } from 'vitest'
import { AnyAtom } from 'src/ScopeProvider2/types'
import type { Store as BaseStore } from 'src/ScopeProvider3/types'

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

export type PrdStore = Exclude<BaseStore, { dev4_get_internal_weak_map: any }>
export type DevStoreRev4 = Omit<
  Extract<BaseStore, { dev4_get_internal_weak_map: any }>,
  keyof PrdStore
>
export type Store = PrdStore & DevStoreRev4
export type NamedStore = BaseStore & { name?: string }

function isDevStore(store: BaseStore): store is PrdStore & DevStoreRev4 {
  return (
    'dev4_get_internal_weak_map' in store &&
    'dev4_get_mounted_atoms' in store &&
    'dev4_restore_atoms' in store
  )
}

export function assertIsDevStore(
  store: BaseStore
): asserts store is PrdStore & DevStoreRev4 {
  if (!isDevStore(store)) {
    throw new Error('Store is not a dev store')
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type WithJestMock<T extends (...args: any[]) => any> = T & Mock<T>

export function subscribe(store: BaseStore, atom: AnyAtom) {
  const cb = vi.fn()
  return [cb, store.sub(atom, cb)] as const
}

export function getAtoms(store: BaseStore, atoms: AnyAtom[]) {
  return atoms.map((atom) => store.get(atom))
}

export function increment(value: number) {
  return value + 1
}
