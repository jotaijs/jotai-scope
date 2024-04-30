# jotai-scope

👻🔭

https://jotai.org/docs/integrations/scope

## Pro Tips

1. Within a `ScopeProvider`, although an atom may not be scoped, its `atom.read` function could be called multiple times. **Therefore, do not use `atom.read` to perform side effects.**

    NOTE: Async atoms always have side effects. To handle it, add additional code to prevent extra side effects. You can check this [issue](https://github.com/jotaijs/jotai-scope/issues/25#issuecomment-2014498893) as an example.

2. Scoping a derived atom has no behavioral effect. Avoid it.

    Derived atoms are merely proxies of primitive atoms. When scoping a derived atom, although the atom itself is copied, all of those copies still reference the same primitive atom, so their values are still shared.

    It is a common pattern in Jotai to wrap the primitive atom within a utility function. To scope it properly, you should expose the primitive atom and then apply the scoping to it.

    ``` javascript
    function someAtomUtility(initialValue) {
      // This is the primitive atom. Return it and then scope it.
      const anAtom = atom(initialValue)

      // Be careful, this is a derived atom! Scoping it has no effect.
      return atom(
        (get) => get(anAtom),
        (get, set, update) => set(anAtom, update)
      ),
    }
    ```