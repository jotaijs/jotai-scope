import { useState } from 'react';
import { render, act } from '@testing-library/react';
import { atom, useAtomValue } from 'jotai';
import { ScopeProvider } from '../../src/index';
import { clickButton } from '../utils';

describe('ScopeProvider', () => {
  it('mounts and unmounts successfully', () => {
    const baseAtom = atom(0);
    function Component() {
      const base = useAtomValue(baseAtom);
      return <div className="base">{base}</div>;
    }
    function App() {
      const [isMounted, setIsMounted] = useState(false);
      return (
        <>
          <div>
            <button
              className="mount"
              type="button"
              onClick={() => setIsMounted((t) => !t)}
            >
              Mount
            </button>
          </div>
          {isMounted && (
            <ScopeProvider atoms={[baseAtom]}>
              <Component />
            </ScopeProvider>
          )}
        </>
      );
    }
    const { unmount, container } = render(<App />);
    const mountButton = '.mount';
    const base = '.base';

    act(() => clickButton(container, mountButton));
    expect(container.querySelector(base)).not.toBe(null);
    act(() => clickButton(container, mountButton));
    expect(container.querySelector(base)).toBe(null);
    act(() => clickButton(container, mountButton));
    unmount();
    expect(container.querySelector(base)).toBe(null);
  });
});
