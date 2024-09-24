import { fireEvent } from '@testing-library/react'
import { Store } from 'src/ScopeProvider/types'
import { INTERNAL_DevStoreRev4, INTERNAL_PrdStore } from 'jotai/vanilla/store'

function getElements(container: HTMLElement, querySelectors: string[]): Element[] {
  return querySelectors.map((querySelector) => {
    const element = container.querySelector(querySelector)
    if (!element) {
      throw new Error(`Element not found: ${querySelector}`)
    }
    return element
  })
}

export function getTextContents(container: HTMLElement, selectors: string[]): string[] {
  return getElements(container, selectors).map((element) => element.textContent!)
}

export function clickButton(container: HTMLElement, querySelector: string) {
  const button = container.querySelector(querySelector)
  if (!button) {
    throw new Error(`Button not found: ${querySelector}`)
  }
  fireEvent.click(button)
}

export function getDevStore(store: Store): INTERNAL_PrdStore & INTERNAL_DevStoreRev4 {
  if (!isDevStore(store)) {
    throw new Error('Store is not a dev store')
  }
  return store
}

export function isDevStore(store: Store): store is INTERNAL_PrdStore & INTERNAL_DevStoreRev4 {
  return (
    'dev4_get_internal_weak_map' in store &&
    'dev4_get_mounted_atoms' in store &&
    'dev4_restore_atoms' in store
  )
}

export function assertIsDevStore(
  store: Store,
): asserts store is INTERNAL_PrdStore & INTERNAL_DevStoreRev4 {
  if (!isDevStore(store)) {
    throw new Error('Store is not a dev store')
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
