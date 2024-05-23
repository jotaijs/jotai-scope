import { render } from '@testing-library/react';
import { type WritableAtom, type PrimitiveAtom, atom, useAtom } from 'jotai';
import { clickButton, getTextContents } from '../utils';
import { ScopeProvider } from '../../src/index';

let baseAtom: PrimitiveAtom<number>;

type WritableNumberAtom = WritableAtom<number, [number?], void>;

const writableAtom: WritableNumberAtom = atom(0, (get, set, value = 0) => {
  set(writableAtom, get(writableAtom) + get(baseAtom) + value);
});

const thisWritableAtom: WritableNumberAtom = atom(
  0,
  function write(this: WritableNumberAtom, get, set, value = 0) {
    set(this, get(this) + get(baseAtom) + value);
  },
);

function renderTest(targetAtom: WritableNumberAtom) {
  baseAtom = atom(0);
  const Component = ({ level }: { level: string }) => {
    const [value, increaseWritable] = useAtom(targetAtom);
    const [baseValue, increaseBase] = useAtom(baseAtom);
    return (
      <div className={level}>
        <div className="read">{value}</div>
        <div className="readBase">{baseValue}</div>
        <button
          type="button"
          className="write"
          onClick={() => increaseWritable()}
        >
          increase writable atom
        </button>
        <button
          type="button"
          className="writeBase"
          onClick={() => increaseBase(level === 'level0' ? 1 : 10)}
        >
          increase scoped atom
        </button>
      </div>
    );
  };

  const App = () => {
    return (
      <>
        <h1>unscoped</h1>
        <Component level="level0" />
        <ScopeProvider atoms={[baseAtom]}>
          <h1>scoped</h1>
          <p>
            writable atom should update its value in both scoped and unscoped
            and read scoped atom
          </p>
          <Component level="level1" />
        </ScopeProvider>
      </>
    );
  };
  return render(<App />);
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
        atomKey === 'writableAtom' ? writableAtom : thisWritableAtom;
      const { container } = renderTest(target);

      const increaseLevel0BaseAtom = '.level0 .writeBase';
      const increaseLevel0Writable = '.level0 .write';
      const increaseLevel1BaseAtom = '.level1 .writeBase';
      const increaseLevel1Writable = '.level1 .write';

      const selectors = [
        '.level0 .readBase',
        '.level0 .read',
        '.level1 .readBase',
        '.level1 .read',
      ];

      // all initial values are zero
      expect(getTextContents(container, selectors)).toEqual([
        '0', // level0 readBase
        '0', // level0 read
        '0', // level1 readBase
        '0', // level1 read
      ]);

      // level0 base atom updates its value to 1
      clickButton(container, increaseLevel0BaseAtom);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '0', // level0 read
        '0', // level1 readBase
        '0', // level1 read
      ]);

      // level0 writable atom increases its value, level1 writable atom shares the same value
      clickButton(container, increaseLevel0Writable);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '0', // level1 readBase
        '1', // level1 read
      ]);

      // level1 writable atom increases its value,
      // but since level1 base atom is zero,
      // level0 and level1 writable atoms value should not change
      clickButton(container, increaseLevel1Writable);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '0', // level1 readBase
        '1', // level1 read
      ]);

      // level1 base atom updates its value to 10
      clickButton(container, increaseLevel1BaseAtom);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '1', // level0 read
        '10', // level1 readBase
        '1', // level1 read
      ]);

      // level0 writable atom increases its value using level0 base atom
      clickButton(container, increaseLevel0Writable);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '2', // level0 read
        '10', // level1 readBase
        '2', // level1 read
      ]);

      // level1 writable atom increases its value using level1 base atom
      clickButton(container, increaseLevel1Writable);
      expect(getTextContents(container, selectors)).toEqual([
        '1', // level0 readBase
        '12', // level0 read
        '10', // level1 readBase
        '12', // level1 read
      ]);
    },
  );
});
