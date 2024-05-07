import { render } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import App from '../examples/03_nested/src/App';
import { clickButton, getTextContents } from './utils';

describe('Counter', () => {
  test('nested primitive atoms are correctly scoped', () => {
    const { container } = render(<App />);
    const increaseUnscopedBase1 = '.unscoped.setBase1';
    const increaseUnscopedBase2 = '.unscoped.setBase2';
    const increaseAllUnscoped = '.unscoped.setAll';
    const increaseLayer1Base1 = '.layer1.setBase1';
    const increaseLayer1Base2 = '.layer1.setBase2';
    const increaseAllLayer1 = '.layer1.setAll';
    const increaseLayer2Base1 = '.layer2.setBase1';
    const increaseLayer2Base2 = '.layer2.setBase2';
    const increaseAllLayer2 = '.layer2.setAll';

    const atomValueSelectors = [
      '.unscoped.base1',
      '.unscoped.base2',
      '.unscoped.base',
      '.layer1.base1',
      '.layer1.base2',
      '.layer1.base',
      '.layer2.base1',
      '.layer2.base2',
      '.layer2.base',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '0',
      '0',
      '1',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseAllUnscoped);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '2',
      '1',
      '0',
      '2',
      '1',
      '0',
      '0',
      '1',
    ]);

    clickButton(container, increaseLayer1Base1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '2',
      '1',
      '1',
      '2',
      '1',
      '1',
      '0',
      '1',
    ]);

    clickButton(container, increaseLayer1Base2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '3',
      '1',
      '1',
      '3',
      '1',
      '1',
      '0',
      '1',
    ]);

    clickButton(container, increaseAllLayer1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '2',
      '4',
      '2',
      '2',
      '0',
      '2',
    ]);

    clickButton(container, increaseLayer2Base1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '3',
      '4',
      '2',
      '3',
      '0',
      '2',
    ]);

    clickButton(container, increaseLayer2Base2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '3',
      '4',
      '2',
      '3',
      '1',
      '2',
    ]);

    clickButton(container, increaseAllLayer2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '3',
      '4',
      '4',
      '3',
      '4',
      '2',
      '3',
    ]);
  });
});
