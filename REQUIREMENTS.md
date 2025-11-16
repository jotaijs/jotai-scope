1. All scoped state must live inside the nearest ancestor Jotai Provider store (or the global default store), never in separate stores per scope.
2. Scoped behavior is implemented by cloning atom objects so that each scoped variant uses a distinct atom identity as the key into the shared store.
3. Scopes are modeled as levels S0, S1, S2, ... with notation Sx[explicitAtoms]: Aₖ, Bₖ, Cₖ(...) describing which atoms are explicit and at what depth their evaluations run.
4. The “influence depth” of a derived atom is the maximum scope level of any explicit scoped atom in its transitive dependency graph for that evaluation.
5. Atoms are classified into explicit scoped atoms, implicit scoped atoms, inherited/unscoped atoms, and dependent scoped derived atoms.
6. Dependent scoped atoms are derived atoms whose transitive dependencies include at least one explicit scoped atom in the current scope hierarchy.
7. Dependent scoped atoms must be cloned per influence depth (scope level) so each depth-specific variant has its own atom identity.
8. Inherited/unscoped atoms are atoms that are not explicitly scoped at any level relevant to the current evaluation and therefore use the global (depth 0) atom identity.
9. Explicit scoped atoms are those listed in a ScopeProvider’s atoms/atomFamilies props and must always get a cloned atom identity for that scope level.
10. Implicit scoped atoms are cloned atom identities created when an explicit scoped atom’s read function synchronously touches additional atoms during evaluation.
11. Dependent scoped atoms must not create new implicit scoped primitives; they simply read whichever explicit or unscoped primitives are visible at their scope level.
12. Dependent scoped atoms cannot read implicit scoped atoms, whereas explicit and implicit scoped atoms may share and read implicit scoped atoms.
13. For classification and scoping decisions, only synchronous get calls within the read function’s main (pre-await) execution are considered dependencies.
14. Late asynchronous get calls (after the synchronous phase) must not influence dependency tracking or classification but must still return the correct scoped value.
15. Each readAtomState invocation must be treated as a per-atom transaction that buffers writes to atomState, mounts, invalidated sets, and changed sets.
16. At the end of the synchronous part of readAtomState, the transaction must compute the atom’s classification (unscoped, explicit, implicit, or dependent scoped) based on the collected deps.
17. After classification, the transaction must commit all buffered changes into exactly one target atom identity (e.g. C₀, C₁, C₃), and never partially into multiple identities.
18. The commit for a readAtomState transaction must happen before Jotai’s recomputeDependents logic runs so dependents see the correct target atom identity and state.
19. Async atoms must write their pending promise and eventual resolved or rejected value into the classified target atom identity chosen at the end of the synchronous phase.
20. Classification must never be changed by asynchronous get calls, and we must not attempt to reclassify or migrate promises after they have been committed.
21. In development mode, calling get on an explicit scoped atom after classification in a way that would have changed the atom’s depth must throw an error.
22. In production mode, late get on explicit scoped atoms must still read the correct scoped value but must silently have no effect on classification.
23. Bi-stable classification is allowed: a dependent derived atom may evaluate as unscoped in one evaluation and dependent scoped in another, based purely on its synchronous dependencies.
24. Dependent scoped atoms are treated as derived-only and must not be directly writable by user code.
25. Writable derived atoms (with custom write functions) are treated like any other explicit or unscoped derived atom, with their get and set calls resolved through scope-aware mapping.
26. Scope-aware get must always resolve each dependency atom to the correct clone for the current scope (explicit clone at that level if available, otherwise inherited clone).
27. Scope-aware set must write to the correct underlying atom identity (scoped or unscoped) according to the same resolution rules used for get.
28. Dependent scoped clones for a given atom and scope level must be created lazily on the first evaluation where classification determines a nonzero influence depth at that level.
29. Once a dependent scoped clone exists for a given atom and scope level, that scope must resolve useAtom for that atom to the clone identity for any evaluation that classifies as dependent at that level.
30. For async atoms that semantically depend on scoped atoms, users are encouraged either to synchronously touch the scoped atoms at the top of the read or to factor that logic into an explicitly scoped helper atom.
31. A utility like markDependent(atom, [deps...]) may be provided to predeclare that an atom should be treated as dependent scoped in any scope where any of the listed deps are explicit, even if the sync read doesn’t touch them.
