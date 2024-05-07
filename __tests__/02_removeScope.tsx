import { render } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import App from '../examples/02_removeScope/src/App';
import { clickButton, getTextContents } from './utils';

describe('Counter', () => {
  test('atom get correct value when ScopeProvider is added/removed', () => {
    const { container } = render(<App />);
    const increaseUnscopedBase1 = '.unscoped.setBase1';
    const increaseUnscopedBase2 = '.unscoped.setBase2';
    const increaseScopedBase1 = '.scoped.setBase1';
    const increaseScopedBase2 = '.scoped.setBase2';
    const toggleScope = '#toggleScope';

    const atomValueSelectors = [
      '.unscoped.base1',
      '.unscoped.base2',
      '.scoped.base1',
      '.scoped.base2',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '1',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
      '0',
    ]);

    clickButton(container, increaseScopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '0',
    ]);

    clickButton(container, increaseScopedBase2);
    clickButton(container, increaseScopedBase2);
    clickButton(container, increaseScopedBase2);

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '3',
    ]);

    clickButton(container, toggleScope);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '1',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3',
      '1',
      '3',
      '1',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3',
      '2',
      '3',
      '2',
    ]);

    clickButton(container, increaseScopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '2',
      '4',
      '2',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '3',
    ]);

    clickButton(container, toggleScope);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '0',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '1',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '2',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '3',
    ]);
  });
});
