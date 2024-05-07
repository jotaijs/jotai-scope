import { fireEvent } from '@testing-library/react';

function getElements(
  container: HTMLElement,
  querySelectors: string[],
): Element[] {
  return querySelectors.map((querySelector) => {
    const element = container.querySelector(querySelector);
    if (!element) {
      throw new Error(`Element not found: ${querySelector}`);
    }
    return element;
  });
}

export function getTextContents(
  container: HTMLElement,
  selectors: string[],
): string[] {
  return getElements(container, selectors).map(
    (element) => element.textContent!,
  );
}

export function clickButton(container: HTMLElement, querySelector: string) {
  const button = container.querySelector(querySelector);
  if (!button) {
    throw new Error(`Button not found: ${querySelector}`);
  }
  fireEvent.click(button);
}
