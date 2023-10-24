import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';
import { useHydrateAtoms } from 'jotai/react/utils';
import { PropsWithChildren } from 'react';

const primitiveAtom = atom(0);
const scopedAtom1 = atom(1);
const scopedAtom2 = atom(2);
const derivedAtom1 = atom((get) => get(scopedAtom1) + 1);
const derivedAtom2 = atom((get) => get(primitiveAtom) + get(scopedAtom1) + 3);
const derivedAtom3 = atom(
  (get) => get(primitiveAtom) + get(scopedAtom1) + get(scopedAtom2),
);

const Counter1 = () => {
  const [p, setP] = useAtom(primitiveAtom);
  const [s1, setS1] = useAtom(scopedAtom1);
  const [d1] = useAtom(derivedAtom1);
  const [d2] = useAtom(derivedAtom2);
  return (
    <>
      <div>
        <span>p: {p}</span>
        <button type="button" onClick={() => setP((x) => x + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>s1: {s1}</span>
        <button type="button" onClick={() => setS1((x) => x + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>d1: {d1}</span>
      </div>
      <div>
        <span>d2: {d2}</span>
      </div>
    </>
  );
};

const Counter2 = () => {
  const [p, setP] = useAtom(primitiveAtom);
  const [s1, setS1] = useAtom(scopedAtom1);
  const [s2, setS2] = useAtom(scopedAtom2);
  const [d1] = useAtom(derivedAtom1);
  const [d2] = useAtom(derivedAtom2);
  const [d3] = useAtom(derivedAtom3);
  return (
    <>
      <div>
        <span>p: {p}</span>
        <button type="button" onClick={() => setP((x) => x + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>s1: {s1}</span>
        <button type="button" onClick={() => setS1((x) => x + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>s2: {s2}</span>
        <button type="button" onClick={() => setS2((x) => x + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>d1: {d1}</span>
      </div>
      <div>
        <span>d2: {d2}</span>
      </div>
      <div>
        <span>d3: {d3}</span>
      </div>
    </>
  );
};

function ScopeProviderWithInitializer({
  atomValues,
  children,
}: PropsWithChildren<{
  atomValues: Parameters<typeof useHydrateAtoms>[0];
}>) {
  const atoms = Array.from(atomValues, ([anAtom]) => anAtom);
  return (
    <ScopeProvider atoms={atoms}>
      <AtomsHydrator atomValues={atomValues}>{children}</AtomsHydrator>
    </ScopeProvider>
  );
}

function AtomsHydrator({
  atomValues,
  children,
}: PropsWithChildren<{
  atomValues: Parameters<typeof useHydrateAtoms>[0];
}>) {
  useHydrateAtoms(atomValues);
  return <>{children}</>;
}

export default function App() {
  return (
    <div>
      <h1>Global</h1>
      <Counter1 />
      <h1>First Provider</h1>
      <ScopeProvider atoms={[scopedAtom1]}>
        <Counter1 />
      </ScopeProvider>
      <h1>Second Provider</h1>
      <ScopeProvider atoms={[scopedAtom1]}>
        <Counter1 />
      </ScopeProvider>
      <h1>Provider with initial value 10</h1>
      <ScopeProviderWithInitializer
        atomValues={
          [[scopedAtom1, 10]] as unknown as Parameters<
            typeof useHydrateAtoms
          >[0]
        }
      >
        <Counter1 />
      </ScopeProviderWithInitializer>
      <h1>Nested Provider</h1>
      <h2>Layer1</h2>
      <ScopeProvider atoms={[scopedAtom1]}>
        <Counter1 />
        <h2>Layer2</h2>
        <ScopeProvider atoms={[scopedAtom2]}>
          <Counter2 />
          <h2>Layer3</h2>
          <ScopeProvider atoms={[scopedAtom1]}>
            <Counter2 />
          </ScopeProvider>
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
}
