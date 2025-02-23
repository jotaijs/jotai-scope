## Goals

1. don't copy atoms
2. remove writable hack

### explicitly scoped

```ts
if (explicit.has(atom)) {
  // handle explicit
  return atom
}
```

### implicitly scoped

```ts

else if (implicit.has(atom)) {
  return currentScope.getAtom(atom)
  // handle implicit
}
```

### inherited scoped

```ts
/** returns nearest ancestor scope if atom is explicitly scoped in any ancestor store */
const scope = searchAncestorScopes(atom)
else if (scope) {
  // handle inherited
  return scope.getAtom(atom)
}
```

### inherited implicitly scoped

else if the dependent atom is explicitly or implicitly scoped in an ancestor store, current atom is implicitly scoped in that ancestor store if it is not
how: ???

```ts
else if (searchAncestorScopes(dependentAtom)) {
  isScopedAtom(dependentAtom)
  // handle implicit
}
```

### unscoped

else atom is unscoped

#### unscoped derived

if atom is derived, it can access scoped atoms
how: ???

### unscoped writable

if atom is writable, it can access scoped atoms
how: ???
