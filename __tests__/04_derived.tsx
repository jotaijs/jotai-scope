import { render } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import App from '../examples/04_derived/src/App';
import { clickButton, getTextContents } from './utils';

describe('Counter', () => {
  const increaseCase1Base = '.case1.setBase';
  const increaseCase1Derived1 = '.case1.setDerived1';
  const increaseCase1Derived2 = '.case1.setDerived2';
  const increaseCase2Base = '.case2.setBase';
  const increaseCase2Derived1 = '.case2.setDerived1';
  const increaseCase2Derived2 = '.case2.setDerived2';
  const increaseLayer1Base = '.layer1.setBase';
  const increaseLayer1Derived1 = '.layer1.setDerived1';
  const increaseLayer1Derived2 = '.layer1.setDerived2';
  const increaseLayer2Base = '.layer2.setBase';
  const increaseLayer2Derived1 = '.layer2.setDerived1';
  const increaseLayer2Derived2 = '.layer2.setDerived2';

  const atomValueSelectors = [
    '.case1.base',
    '.case1.derived1',
    '.case1.derived2',
    '.case2.base',
    '.case2.derived1',
    '.case2.derived2',
    '.layer1.base',
    '.layer1.derived1',
    '.layer1.derived2',
    '.layer2.base',
    '.layer2.derived1',
    '.layer2.derived2',
  ];

  test('case 1, derived atom are scoped when base is scoped', () => {
    const { container } = render(<App />);

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
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseCase1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
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

    clickButton(container, increaseCase1Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '2',
      '2',
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

    clickButton(container, increaseCase1Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3',
      '3',
      '3',
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
  });

  test('case 2, derived implicitly shares base scoped atom', () => {
    const { container } = render(<App />);

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
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseCase2Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '1',
      '0',
      '0',
      '1',
      '0',
      '1',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseCase2Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '1',
      '1',
      '1',
      '1',
      '0',
      '1',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseCase2Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '1',
      '2',
      '2',
      '1',
      '0',
      '1',
      '0',
      '0',
      '0',
    ]);
  });

  test("parent scope's derived atom is prior to nested scope's scoped base", () => {
    const { container } = render(<App />);

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
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseLayer1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '1',
      '0',
      '0',
      '1',
      '0',
      '1',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseLayer1Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '1',
      '0',
      '0',
      '1',
      '1',
      '1',
      '0',
      '1',
      '0',
    ]);

    clickButton(container, increaseLayer1Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '2',
      '0',
      '0',
      '2',
      '1',
      '2',
      '0',
      '1',
      '0',
    ]);

    clickButton(container, increaseLayer2Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '2',
      '0',
      '0',
      '2',
      '1',
      '2',
      '1',
      '1',
      '1',
    ]);

    clickButton(container, increaseLayer2Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '2',
      '0',
      '0',
      '2',
      '2',
      '2',
      '1',
      '2',
      '1',
    ]);

    clickButton(container, increaseLayer2Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '2',
      '0',
      '0',
      '2',
      '2',
      '2',
      '2',
      '2',
      '2',
    ]);
  });
});
