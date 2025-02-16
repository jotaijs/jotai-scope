import { fireEvent } from '@testing-library/react'
import type { Store } from 'src/types'
import { Mock } from 'vitest'

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

export type PrdStore = Exclude<Store, { dev4_get_internal_weak_map: any }>
type DevStoreRev4 = Omit<
  Extract<Store, { dev4_get_internal_weak_map: any }>,
  keyof PrdStore
>

function isDevStore(store: Store): store is PrdStore & DevStoreRev4 {
  return (
    'dev4_get_internal_weak_map' in store &&
    'dev4_get_mounted_atoms' in store &&
    'dev4_restore_atoms' in store
  )
}

export function assertIsDevStore(
  store: Store
): asserts store is PrdStore & DevStoreRev4 {
  if (!isDevStore(store)) {
    throw new Error('Store is not a dev store')
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type WithJestMock<T extends (...args: any[]) => any> = T & Mock<T>
