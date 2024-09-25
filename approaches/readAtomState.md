## Objectives

1. Derived atoms are copied even if they don’t depend on scoped atoms.
2. If the derived atom has already mounted, don't call onMount again.
   Fixes:

- [Scope caused atomWithObservable to be out of sync](https://github.com/jotaijs/jotai-scope/issues/36)
- [Computed atoms get needlessly triggered again](https://github.com/jotaijs/jotai-scope/issues/25)

## Requirements

1. Some way to get whether the atom has been mounted.
2. Some way to bypass the onMount call if the atom is already mounted.
