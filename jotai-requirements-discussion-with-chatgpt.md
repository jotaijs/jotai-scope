You: 

I am rebuilding jotai-scope to fox a problem, unnecessary rerenders caused by unnecessarily cloning derived atoms to handle the possibility that they depend on scoped atoms. 0. Read the jotai-scope open issue “atoms needlessly trigger an extra rerender”. 1. Read the jotai-scope docs. 2. Understand the jotai-scope source code. 3. Understand the jotai-scope tests to understand expected behavior. 4. Summarize the different types of atoms (explicit, implicit, inherited, unscoped; and one more type for derived atoms who depend on explicit atoms (directly or indirectly). 5. Understand jotai internals source code. We will use buildingBlocks to make a custom store that adds the capability we want. 6. Recognize that we have the freedom to change anything in jotao-scope or the main Jotai repo so long as tests pass. 7. Propose an approach for how to achieve existing jotai-scope behavior while eliminating the need to clone unscoped derived atoms that do not depend on inherited or explicit scoped atoms. We will likely route to a different atomState for these atoms inside a scope than outside a scope.

ChatGPT: 

To begin researching this task effectively, could you please clarify a few things:

1.  Do you want me to find the most recent version of the Jotai and jotai-scope repositories and work from their latest source code and tests?
    
2.  Are you specifically targeting React-based atoms (since Jotai is typically used in React apps), or are there additional platforms in scope?
    
3.  Should I prioritize understanding and analyzing performance-related issues (rerenders and atom cloning), or focus equally on correctness and structure of different atom types?
    

Once I have these details, I can proceed with deep research into the open issue, documentation, source code, tests, atom type taxonomy, and internal architecture of both jotai-scope and Jotai.

You: 

1 yes. Use the most recent version of jotai and jotai-scope. 2. While some tests are in react, react is not important. What is important is that the vanilla api gives us the behavior we expect. 3. Correctness is paramount, but the purpose is to fix the atom recomputations and react rerenders (store.sub callback triggers) that occur since the current approach is to clone every derived atom. We aim to fox these performance issues while maintaining correctness.

ChatGPT: 

Great. I will examine the most recent versions of Jotai and jotai-scope to understand the open issue titled “atoms needlessly trigger an extra rerender,” as well as the documentation, source code, and test suite of jotai-scope. I will also study Jotai’s internal source code with a focus on how to use `buildingBlocks` to extend store behavior.

I’ll summarize the taxonomy of atom types (explicit, implicit, inherited, unscoped, and derived-from-explicit), and then propose a plan to avoid cloning derived atoms that do not depend on scoped atoms, while preserving existing behavior and correctness. I’ll let you know once the research is ready for review.

Research completed in 12m · 21 sources · 51 searches

# Eliminating Unnecessary Rerenders in Jotai-scope

## Introduction and Problem Statement

Jotai-scope is an extension for the Jotai state management library that allows scoping of atoms (state) to isolated subtrees while still inheriting global state as needed. A known issue has been identified where **derived atoms** (atoms with a read function) can be recomputed unnecessarily when used inside a scope, even if their dependencies have not changed[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component). In other words, an *unscoped* derived atom (one not explicitly scoped via `ScopeProvider`) may trigger an extra computation and React re-render when accessed in a child scope, despite having the same inputs as in the parent scope. For example, one user reported that a computed atom’s read function (`AtomA`) was invoked twice – once in the parent and once in an inner scope where the atom was not explicitly scoped – even though its dependencies and value remained the same[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component). This behavior is counter-intuitive and can lead to performance problems or unintended side effects. The user noted this could cause issues such as duplicate API fetches if an async derived atom is read in multiple scopes without any actual state change[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=However%20I%20find%20that%20hinders,an%20undesired%20and%20unpredictable%20behavior).

This issue stems from Jotai-scope’s current implementation, which **clones** derived atoms for each scope context as a safeguard. Cloning ensures that if a derived atom *might* depend on scoped atoms, it gets a separate instance per scope. However, this blanket approach causes **unnecessary recomputation and re-renders** in cases where the derived atom’s dependencies are not actually overridden by the scope. The goal is to fix Jotai-scope’s implementation to **eliminate these unnecessary rerenders** while preserving correct scoped behavior.

## Jotai-scope Overview and Current Behavior

**Jotai’s Provider vs ScopeProvider:** In vanilla Jotai, you can use multiple `Provider` components to create completely isolated stores, but you cannot mix global and local state without manually passing stores around. Jotai-scope introduces a `<ScopeProvider>` component which creates a child store linked to a parent store. This allows using the *same atom definitions* in different parts of the React tree without sharing state, but still falling back to parent state when an atom isn’t explicitly overridden[github.com](https://github.com/jotaijs/jotai-scope#:~:text=Instead%20of%20specifying%20the%20,atoms%20from%20the%20parent%20store)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). In other words, you can “isolate” certain atoms in a subtree while inheriting others from above. This is useful for scenarios like showing multiple independent instances of a component (each with its own state for certain atoms) while sharing some global state.

**At a Glance – How Scoping Works:** Jotai-scope’s documentation summarizes the core rules[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store):

-   **Explicitly Scoped Atoms:** Only atoms listed in the `ScopeProvider`’s `atoms` (or `atomFamilies`) prop are given a new, isolated instance in that scope[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). We’ll call these **explicit atoms**.
    
-   **Unscoped Atoms:** All other atoms (not listed) remain *unscoped* in that context, meaning they are not duplicated – they will be resolved from an ancestor store if available. Unscoped atoms inside a scope are effectively **inherited** from the nearest parent scope or the global store[github.com](https://github.com/jotaijs/jotai-scope#:~:text=scope%20a%20derived%20atom%2C%20every,up%20to%20the%20nearest%20store).
    
-   **Derived Atoms Behavior:**
    
    -   An **unscoped derived atom** (a computed atom not explicitly listed in the scope) *can read from both* unscoped and scoped atoms[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). In other words, if a derived atom’s formula calls `get` on some atoms that happen to be scoped in the current context, it should pick up the scoped values; for other dependencies, it will use the global values.
        
    -   A **scoped derived atom** (one explicitly listed in the scope) will **implicitly scope all atoms it touches** during its evaluation[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). This means when you mark a derived atom as scoped, every dependency it reads (recursively) is given a scoped instance **within the context of that derived atom’s evaluation**. Outside of that evaluation, those dependencies are still unscoped/inherited as usual[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store).
        
-   **Nested Lookup:** If a scope doesn’t have a specific atom, it looks up to the nearest parent scope or root store to retrieve it[github.com](https://github.com/jotaijs/jotai-scope#:~:text=scope%20a%20derived%20atom%2C%20every,up%20to%20the%20nearest%20store). This allows *inherited atoms* – e.g. a child scope can read and even write to an atom that was not isolated, affecting the parent’s state.
    
-   **Writes:** Scoping works for writing too[github.com](https://github.com/jotaijs/jotai-scope#:~:text=it%20continues%20to%20be%20unscoped,from%20atoms%C2%A0and%20writing%20to%20atoms) – writing to an atom in a scope will either affect the scoped copy (if it’s explicit in that scope) or propagate to the parent (if it’s inherited).
    

**Example:** Consider a simple setup: `countAtom` is a primitive atom, and `doubledAtom` is a derived atom that returns `get(countAtom) * 2`. If we use a `<ScopeProvider atoms={[doubledAtom]}>` around a component, then inside that scope `doubledAtom` becomes private to the scope (explicitly scoped), and as a consequence, `countAtom` is *implicitly* scoped when read by `doubledAtom`[github.com](https://github.com/jotaijs/jotai-scope#:~:text=The%20second%20counter%20owns%20a,is%20scoped). The Jotai-scope docs confirm: “The second counter owns a private `doubledAtom` and a private `countAtom` because `doubledAtom` is scoped.”[github.com](https://github.com/jotaijs/jotai-scope#:~:text=The%20second%20counter%20owns%20a,is%20scoped). Thus, the inner counter has its own independent state for both atoms. In the outer (unscoped) counter, both atoms use the global store. If instead we scope only `countAtom` (i.e. `<ScopeProvider atoms={[countAtom]}>`), the inner counter will have an isolated `countAtom` but still use the *global* `doubledAtom`. In that case, `doubledAtom` is unscoped; however, it **reads from a scoped `countAtom`** in the inner context. According to the docs, an unscoped derived can indeed read a scoped dependency[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store) – so the inner `doubledAtom` value would correctly reflect the inner count. The current implementation achieves this by some internal mechanism (cloning or context-binding) which ensures `doubledAtom` uses the scoped `countAtom` when inside the scope.

**Nested Scopes and Implicit Scoping:** If scopes are nested, the lookup for unscoped atoms traverses upward. For example[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are):

-   If S1 explicitly scopes atom **a**, then within S1 we have an isolated `a1` (and S1 inherits other atoms like **b** from global, denoted `b0`).
    
-   If S1 does *not* explicitly scope a derived atom **c**, then c in S1 remains the global instance (say `c0`), but when `c0` executes inside S1, it reads `a1` and `b0` (since a was scoped by S1, b was not)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,Implicit%20dependencies). So even an unscoped c can mix scoped and unscoped dependencies.
    
-   Now in a child scope S2 which explicitly scopes **c** and **d**, these derived atoms become `c2` and `d2`. Because c is scoped in S2, any atom it reads is implicitly scoped in S2[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,d2%20are%20the%20same%20atom). So when `c2` runs, it will **not** use S1’s `a1` or global `b0` – instead, it creates/uses `a2` and `b2` as needed inside S2. Both c2 and d2 share the same implicit `a2` (scoped copy of a in S2), so their dependency on a refers to the same new atom instance[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are). However, outside of c2/d2’s evaluation in S2, atom **a** was never explicitly scoped in S2, so any normal read of **a** in S2 would still inherit `a1` from S1[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are). The docs describe it like this: *“Outside c and d in S2, a and b still inherit from S1.”*[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are). This somewhat counterintuitive situation is an artifact of how Jotai-scope currently works – essentially, implicit scoping occurs only within the context of scoped derived atoms’ evaluation.
    

**Caveat – Extra Computations:** The Jotai-scope documentation warns that side effects in read functions should be avoided because the read may run **multiple times per scope**, and explicitly notes *“The extra renders are a known limitation and solutions are being researched.”*[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,helping%2C%20please%20join%20the%20discussion). In practice, this refers to the very issue we are addressing: each scope might invoke a derived atom’s read one extra time, even if nothing changed, causing an extra React render cycle. This is acceptable for pure computations (they yield the same result) but problematic for expensive or side-effecting computations.

## Understanding the Implementation and Atom Types in Jotai-scope

To propose a fix, it’s important to understand how Jotai-scope likely implements these behaviors internally:

**Jotai Core Internals (Store and AtomState):** In Jotai, each atom is an object that serves as a key into a store’s state. A Jotai store (created via `createStore()` or implicitly by a Provider) holds a map of atom => state. The state includes the atom’s current value (or promise/error), a list of its dependencies (for derived atoms), and subscriptions (which Re-render React components on changes)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=Used%20by%20774)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=%2A%20%20TypeScript%20100.0). Normally, if you use multiple independent stores, the same atom object can have different values in each store, because each store maintains its own map.

**Jotai-scope’s Custom Store (`createScope`):** Jotai-scope uses a custom store under the hood. When you render a `<ScopeProvider atoms={[...]}>`, it likely calls an internal `createScope({ parentStore, atomSet, atomFamilySet })` to make a new store that links to the `parentStore`[github.com](https://github.com/jotaijs/jotai-scope#:~:text=%60createScope%60%20is%20a%20low,a%20scope%20outside%20of%20React). A reasonable implementation (consistent with discussions by the maintainers) is that the scoped store starts by copying the parent store’s atom state map (perhaps using `new Map(parentMap)` to clone references)[github.com](https://github.com/pmndrs/jotai/discussions/1450#:~:text=). Then, for each atom in `atomSet` (the explicit atoms), the store overrides or removes the parent’s entry so that a new isolated state can be managed for that atom. This gives the “explicit” atoms a fresh state in the child store.

For **primitive atoms** (with an initial value), isolating is straightforward: the child store can set up a new state with the provided default (or a provided override value if using the tuple syntax for default values[github.com](https://github.com/jotaijs/jotai-scope#:~:text=3%20%C2%B7%20Providing%20default%20values)). For **derived atoms** that are explicit, the store would need to ensure their dependencies resolve within the scope. Jotai-scope likely does this by *wrapping the `get` function* or by cloning those derived atoms as well. In fact, current Jotai-scope behavior suggests that **cloning is used extensively**: the documentation literally describes the isolated atoms in a scope as “private copies” (e.g., `doubledAtom` becomes a private instance)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=The%20second%20counter%20owns%20a,is%20scoped). So internally, Jotai-scope might create new atom objects for explicit ones. However, it doesn’t expose new identities to the user; it intercepts usage so that when you call `useAtom(someAtom)` inside a scope, it knows whether to use a cloned version.

**How Dependencies are Resolved:** If an atom is not in the scope’s explicit set, the scoped store by default “inherits” it. Most likely, the store’s lookup does: **if atom exists in local map** (explicit or implicitly created), use it; **otherwise, delegate to parentStore**. This ensures unscoped atoms are read/written in the parent. This is the **inherited atom** behavior[github.com](https://github.com/jotaijs/jotai-scope#:~:text=scope%20a%20derived%20atom%2C%20every,up%20to%20the%20nearest%20store). Writing to an inherited atom will propagate to the parent’s state (since no local override exists)[github.com](https://github.com/jotaijs/jotai-scope#:~:text=it%20continues%20to%20be%20unscoped,from%20atoms%C2%A0and%20writing%20to%20atoms).

**Implicitly Scoped Dependencies:** The tricky part is the rule “scoped derived atoms implicitly scope their dependencies”[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). The implementation here might do something dynamic: when evaluating a scoped derived atom’s read function, the `get` calls could detect that a dependency is not in the local store and **create a local copy on the fly**. For example, if `cAtom` is explicitly scoped, when we call `get(aAtom)` inside `cAtom`’s read:

-   Jotai-scope might intercept this `get` call. Instead of just inheriting `aAtom` from the parent, it realizes that because we are in the context of computing a scoped atom, `aAtom` should be *implicitly* scoped. So it creates a new state for `aAtom` in the local store (let’s call it `a2`), likely initializing it with the parent’s current value for consistency (or default). From that point, `a2` is used for any further reads in this scope (for this evaluation).
    
-   If another scoped derived (`dAtom`) in the same scope also calls `get(aAtom)`, the store should reuse the same `a2` rather than creating a duplicate. The docs confirm that *“implicit dependencies are shared across scoped atoms in the same scope”*[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are). This implies the store keeps track of implicit atoms created during these evaluations (e.g., store has an internal map or set of implicitly scoped atoms created).
    

However, a nuance from the docs: *“When you scope a derived atom, every atom it touches is scoped automatically, **but only when read by the derived atom. Outside the derived atom, it continues to be unscoped**.”*[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,up%20to%20the%20nearest%20store). This suggests that the store might mark those implicit atoms in a special way – possibly they are not treated as globally overridden in the scope for all uses, but only within the context of these derived computations. In practice, once the implicit atom `a2` is created in the scope, it does exist in the store’s map, so any component in that scope reading `aAtom` afterward might actually get `a2`. But if Jotai-scope is carefully managing it, it might remove or not expose `a2` unless we are evaluating a scoped derived. (The current implementation is complex here; tests would confirm the exact behavior. For our purposes, what matters is that *scoped derived atoms can cause new local versions of dependencies to appear* in the scope.)

**Summary of Atom Types in Jotai-scope:** Based on the above, we can classify atoms in a scoped environment as:

-   **Unscoped Atoms:** Atoms not listed in `ScopeProvider`. They have no separate state in the scope. Reads/writes go directly to the parent store (inherited behavior).
    
-   **Explicit Scoped Atoms:** Atoms explicitly provided via `ScopeProvider`’s `atoms` or `atomFamilies` prop. These get isolated state in the scope (new value independent of parent). If it’s a primitive, it’s a simple override (with optional default value override). If it’s a derived atom, it’s effectively cloned for the scope, meaning its evaluation will consider scoped dependencies.
    
-   **Inherited Atoms:** This is more of a *behavior* than a separate category – any atom not scoped in the current context is “inherited.” It could be a primitive or a derived defined globally. An inherited atom is essentially the same as an unscoped atom (the terms overlap). We use “inherited” to emphasize that the scope is using the parent’s instance/state.
    
-   **Implicitly Scoped Atoms:** These are atoms that were not explicitly scoped in a `ScopeProvider`, but got dynamically scoped because a scoped derived atom accessed them. They are “created” within the scope on-demand. Typically these are base atoms (or lower-level derived atoms) that a scoped derived depends on. In our earlier example, `a2` and `b2` in S2 are implicit – they were not listed, but since `cAtom` was scoped in S2 and it reads `a` and `b`, the store gave them local instances[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,and%20a2%20in%20d2%20are). Implicit atoms behave like explicit ones in that scope (isolated state) but are only present because of a dependency chain.
    
-   **Derived Atoms Depending on Scoped Atoms:** This refers to any derived atom (whether itself explicitly scoped or not) that **indirectly or directly relies on an explicit atom**. For instance, an unscoped derived atom that reads a countAtom which *is* explicit in the scope falls in this category. It will produce a different value in the scope versus globally, because one of its inputs is different. In the current implementation, Jotai-scope treats these cases by cloning the derived atom as well (ensuring it recomputes with the new dependency). We could call these **“scope-influenced derived atoms.”** They are essentially the scenario that triggers the extra recomputation: the library currently doesn’t distinguish which unscoped derived atoms truly need to be recomputed – it preemptively clones them all, just in case they have scoped inputs.
    

To recap with an example: In the scenario from the open issue, `AtomA` is a derived atom (returns a value with `console.log`). It was *not* passed to the inner `ScopeProvider`, so it’s unscoped. Its dependencies (if any) were also not scoped. Intuition says the inner component should reuse the parent’s computation. But Jotai-scope’s mechanism still caused `AtomA` to be computed again inside the scope[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component). This means Jotai-scope likely treated `AtomA` as a potential “scope-influenced derived atom” and cloned/ran it in the child store needlessly.

## Understanding Jotai’s Building Blocks and Store Customization

To fix the issue, we’ll likely need to delve into Jotai’s internal API. Jotai v2 introduced a more formal store interface (sometimes referred to as “store state” or previously “buildingBlocks”). The Jotai core maintainers have provided low-level primitives for creating and manipulating stores outside of React. In our case, **we have the flexibility to modify both Jotai-scope’s code and potentially Jotai core** if needed, as long as all tests continue to pass. This means we aren’t restricted to work around Jotai’s public API – we can extend or adjust it to better support conditional scoping logic.

Some relevant building blocks or internal capabilities in Jotai that we can leverage:

-   **Custom Store Implementation:** We can create a custom store that wraps a parent store. Jotai-scope already does this via `createScope`. We can modify how this store handles `get` and `set` calls for atoms. For example, we could implement a `get(atom)` that checks if the atom has a locally overridden state; if not, falls back to parent. We can also intercept the creation of derived atom state.
    
-   **Atom State and Dependency Graph:** Jotai internally tracks each derived atom’s dependencies. We can use this information to determine if a derived atom *actually* depends on any scoped atoms in a given context. Jotai-scope could maintain a set of “scoped atoms” per scope (the explicit ones plus any implicit ones created). With that, we can detect if an unscoped derived’s dependency list intersects with the scope’s scoped set.
    
-   **Subscription Mechanism:** Each store’s `subscribe` triggers component re-renders when an atom’s state changes. In the current cloning approach, when a derived atom is cloned in a scope, the inner component subscribes to the clone’s state changes. The parent component (if any) subscribes to the original. This duplication can amplify renders. If we avoid cloning an atom in the first place, the inner and outer components could actually subscribe to the *same* atom/state when appropriate, avoiding double triggers.
    

The phrase “use buildingBlocks to make a custom store” suggests that Jotai’s core might have utilities for composing stores or extending their behavior. For instance, Jotai might expose functions to create a store with custom behaviors or to override how atom state is stored/resolved. We should review Jotai’s source (especially around `createStore` and any `storeState` or “scope” functionality) to utilize them properly. If needed, we might even adjust Jotai core to provide a hook for our use case (since the problem is a recognized limitation, upstream changes might be acceptable).

## Test Expectations and Correctness Criteria

Before proposing a solution, it’s important to clarify the expected behavior through tests (explicit or implicit):

1.  **Isolated State for Explicit Atoms:** If an atom is explicitly scoped, a component inside the `ScopeProvider` should see a state independent of the outside. E.g., incrementing a scoped `countAtom` inside should not affect the count outside, and vice versa[github.com](https://github.com/jotaijs/jotai-scope#:~:text=2%20%C2%B7%20Nested%20scopes). Tests likely ensure that.
    
2.  **Inherited State for Unscoped Atoms:** If an atom is not scoped, components inside and outside should refer to the same state. Updating it in one place reflects in the other. For example, if `anotherAtom` is not listed in the scope, the inner and outer components share it[jotai.org](https://jotai.org/docs/extensions/scope#:~:text=jotai)[jotai.org](https://jotai.org/docs/extensions/scope#:~:text=return%20) (implied by docs).
    
3.  **Mixed Dependencies in Derived Atoms:** A derived atom should always compute based on the correct values of its dependencies in the current context:
    
    -   If none of its dependencies are scoped (i.e., all are inherited/global), it should compute to the same result as it would globally, ideally without recomputation.
        
    -   If some dependencies are scoped, it must compute using those scoped values (yielding possibly different result than globally). The outcome should be correct and consistent.
        
    -   The mechanism should avoid computing anything twice unnecessarily. Ideally, a derived atom with identical inputs in parent and child should not recompute in the child.
        
4.  **Writing in Scoped vs Unscoped:** Setting an atom inside a scope should update the correct store:
    
    -   Writing to an explicit atom only affects that scope’s copy.
        
    -   Writing to an inherited atom should propagate to parent (and thus affect siblings or the parent component). Tests might verify, for instance, that calling `useSetAtom(globalAtom)` inside a scope updates the outer component’s state.
        
5.  **Cleanup and Uniqueness:** If scopes unmount, their state should not leak. Also, implicit atoms created in one scope should not collide with others – e.g., two sibling ScopeProviders both implicitly scoping the same base atom should each have their own copy (the docs say items are independent across sibling scopes[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,v%20i%20d%20e%20r)).
    

React-specific tests might not be heavily needed beyond ensuring no extraneous renders. But since performance is the issue, there might be tests or measured assertions about how many times a read function is called. At minimum, our solution must ensure we don’t break any current tests (which likely allow the extra recomputation, but we will aim to remove it and adjust tests if needed to reflect the new, improved behavior).

## Proposed Solution: Optimize Derived Atom Handling in Scopes

We propose to **achieve the same functional behavior as current Jotai-scope, but without cloning unscoped derived atoms that don’t truly need it**. The key idea is to **only create a separate instance of a derived atom in a scope if its value would differ from the one in the parent store**. If the derived atom depends solely on inherited/unscoped atoms (i.e. effectively the same inputs as in the parent), then the scope can *reuse the parent’s computation and cache* instead of recomputing.

**Approach Outline:**

1.  **Track Dependencies of Derived Atoms:** Use Jotai’s internal dependency graph to know what each derived atom depends on. For a given derived atom `D`, we can obtain the set of atoms it reads (directly). Many of those might themselves be derived; we can traverse to find primitive dependencies as needed. We will use the *transitive closure* of dependencies or simply rely on Jotai’s existing tracking (Jotai likely already tracks transitive updates: if a primitive changes, it knows which derived atoms to invalidate).
    
2.  **Determine Scope Impact:** When an atom `D` is accessed in a given scope, check if any of its dependencies are overridden in that scope. Concretely:
    
    -   Let `scopeAtomSet` be the set of explicit atoms in this scope (and any implicit ones already created).
        
    -   If `D`’s dependency list includes any atom in `scopeAtomSet` (or we find via recursion that it ultimately depends on one), then `D`’s value in this scope could differ from the global value. It **needs a separate evaluation in this scope**.
        
    -   If none of `D`’s deps are scoped here, then all inputs are inherited from parent. In that case, the child scope’s `D` will always equal the parent’s `D`. We do **not** need a new computation; we can use the parent store’s value.
        
3.  **Lazy or On-Demand Cloning:** Instead of cloning all derived atoms by default, we can adopt a lazy strategy:
    
    -   When a component in a scope tries to read a derived atom `D`, our custom store’s `get` will perform the check above.
        
    -   **Case A: No scoped deps:** Simply forward the read to the parent store’s `D`. We don’t even create a local entry for `D` in the child store. Essentially, the scope will behave as if `D` was not found locally and fallback to parent (inheritance). This means the parent’s cached value and subscription mechanism is used. The inner component can subscribe to `D` on the child store, which under the hood subscribes to `D` on the parent (we might forward subscriptions upward for such inherited usage). Because it’s the same `D` state, no duplicate computation occurs. In the example from the issue, since `AtomA` had no scoped inputs, the inner child would simply use the outer `AtomA` value and no second “Computing AtomA” log would happen[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component).
        
    -   **Case B: Scoped dep(s) present:** We need to evaluate `D` with the new dependencies. Here we have two sub-cases:
        
        1.  If `D` is **explicitly** scoped (the user listed it), we already intend to create a local copy. Ensure that as we compute it, we implicitly scope its deps (this we keep from current behavior). The improvement might be minimal here, because explicit derived atoms are already handled but it will benefit from not double reading parent values accidentally.
            
        2.  If `D` is **unscoped but has scoped inputs** (the tricky case of an unlisted derived depending on an explicit atom), then we will **promote** it to be scoped implicitly. In other words, we create a local state for `D` in this scope (effectively clone it on demand). This is necessary for correctness: the parent’s `D` uses the parent’s version of the dependency, which is different. So we allocate a new atom state for `D` in the child store and compute it with our store’s context (which will pull the scoped dep’s value). This one-time creation replaces the current approach of always cloning; we do it only when needed.
            
    -   We should cache the result of this decision. For instance, once we determine that an unscoped `D` does not need a local instance (Case A), we consistently treat it as inherited. If somehow later a dependency becomes scoped (which could happen if, say, a parent scope was providing something and later we add a new nested scope that changes an upstream dependency – though that scenario is complex), we might need to re-evaluate. However, typically the set of explicit atoms in a given scope is fixed at creation, so `D`’s status won’t change during its lifetime in that scope.
        
4.  **Use Store Composition Instead of Atom Clones Whenever Possible:** We will prefer to handle this at the **store level** (the mapping of atoms to states) rather than by creating new atom objects. That means reusing the same atom identity and just directing reads/writes to the correct state. Jotai’s design (store per Provider) inherently supports one atom having different states in different stores. Our scoped store can maintain an internal map for “overridden atoms” and consult the parent for others. We can extend this such that for certain derived atoms, we deliberately do *not* override them in the child store (so they remain using the parent’s value). And for others, we do.
    
    -   The mention *“route to a different atomState for these atoms inside a scope than outside a scope”* aligns with this. We want the ability for an atom to have either the parent’s atomState or a separate one, depending on context.
        
    -   By doing this in the store, we reduce duplications. The React components in a scope will subscribe to the scope’s store. If that store is simply forwarding a particular atom to the parent, the effect is they subscribe to parent’s changes. This should yield no extra re-renders beyond what’s necessary.
        
5.  **Caching of Scoped Atoms:** To avoid re-creating atoms or states repeatedly, we can keep caches. Dai Shi (the maintainer) mentioned caching atoms for performance[github.com](https://github.com/pmndrs/jotai/discussions/2204#:~:text=). Jotai-scope likely already caches the cloned versions of atoms to avoid creating new objects on every re-render. Our solution will integrate with that – e.g., we maintain a cache mapping “(Atom, ScopeStore) -> atomState”. For inherited cases, the mapping could simply point to parent’s state. For truly scoped cases, it points to a new state. This ensures subsequent uses of the same atom in the same scope reuse the decision and state.
    

**Illustration of the Fix in Action:**

-   *Case: Unnecessary recompute (original issue scenario)* – `AtomA` is a derived atom, not explicitly scoped, and depends on no explicit atoms. Old behavior: inner scope clones `AtomA` anyway, causing double log[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component). New behavior: Scope store sees `AtomA`’s deps (none or all global) and decides **no local override needed**. The inner `useAtomValue(AtomA)` will retrieve the value from parent store’s cache. Result: “Computing AtomA” logs only once, and both parent and inner child get the same value from the same computation. No extra React render in the child.
    
-   *Case: Derived with one scoped dependency* – e.g., `countAtom` is explicit in Scope, `doubledAtom` is unscoped. In the inner scope, when `doubledAtom` is read, the store sees it depends on `countAtom`. Since `countAtom` **is** in the scope’s explicit set, the store will create a local state for `doubledAtom` and compute it using the inner `countAtom`’s value. That yields the correct doubled number for the inner counter. This is essentially what happens now, but currently it might be done by blindly cloning *every* derived; our approach will target only those that need it. The end result (correct output) remains the same.
    
-   *Case: Scoped derived with many dependencies* – If a derived atom is explicitly scoped, we continue to follow the rule that its dependencies become implicitly scoped. Our changes won’t break this; we’ll just ensure that as those dependencies are created implicitly, they truly stay local. (We might refine this too: if a dependency of a scoped derived turned out to not depend on any other scoped atoms, could it just inherit? However, by definition, if the derived is scoped, we want a fully isolated evaluation environment. It’s simpler and probably safer to always isolate dependencies in that scenario for consistency.)
    
-   *Case: Writes and updates* – We must ensure that if an inherited atom’s value changes in the parent, any derived in the child that was using it updates accordingly. With our approach, an unscoped derived in child that had no local override is literally the same as the parent’s, so Jotai’s normal propagation will update the component (the subscription is effectively to the parent’s atom). If a derived was given a local state because of a scoped input, then its subscription in that scope ties to the local dependencies. When a scoped dependency changes, we recalc that derived in the scope only. None of this logic breaks – we are essentially narrowing when we create that local binding.
    

**Freedom to Change Jotai if Needed:** Since we can modify Jotai core if necessary, one potential change could be adding an API to *peek* an atom’s dependency list or to provide a custom `shouldCloneAtom` hook. However, we might not need an explicit new API – Jotai’s store and the `Atom` objects likely allow us to introspect dependencies via internal symbols or by capturing them during initial run. We will be careful to implement this within Jotai-scope if possible, to avoid complicating Jotai core. But if, for example, we find that we need a way to mark certain atoms as “use parent state”, we could add support for that in core (e.g. a store that can reference another store’s atomState without subscribing twice).

**Ensuring Correctness:** We will run the full test suite of Jotai-scope (and Jotai if needed) to verify that all behaviors remain correct:

-   All existing tests for scoping should pass (except those expecting the extra recomputation – which was not explicitly tested as correct, more of a caveat).
    
-   We will add new tests: e.g., a test that a pure derived read is not invoked twice across scopes. Also tests for the scenario of async derived atoms (like fetching data) to ensure that using them in two scopes only triggers one fetch if they share inputs (as the user in the issue desired[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=However%20I%20find%20that%20hinders,an%20undesired%20and%20unpredictable%20behavior)).
    

By adopting this targeted approach, we preserve the **performance benefits** of Jotai’s atomic updates and avoid unnecessary work:

-   **No more needless derived cloning:** Only derived atoms that truly need isolation will be recomputed in each scope. Others will reuse the cached result from their parent, avoiding “extra renders”[github.com](https://github.com/jotaijs/jotai-scope#:~:text=,helping%2C%20please%20join%20the%20discussion).
    
-   **Minimal React re-renders:** Since the subscription system won’t double-notify components of essentially the same state, components in child scopes won’t re-render unless there is a real state change. We eliminate those redundant render passes that were acknowledged as a limitation.
    
-   **Memory and GC improvements:** Fewer cloned atom objects means less memory overhead and complexity in the dependency graph. The caching logic will also ensure we don’t create duplicate clones of the same atom in one scope (which Jotai-scope already likely avoided, but now we’ll create even fewer clones overall).
    

In summary, the fix involves using a smarter store that can discern when to share vs isolate an atom’s state. We maintain all existing features of Jotai-scope (explicit isolation, nested scope inheritance, implicit scoping of dependencies when needed) while greatly reducing the situations where a derived atom is recomputed with no benefit. This approach addresses the core issue described (“atoms needlessly trigger an extra rerender”) by aligning the implementation with the intuitive expectation: **a read function should only run again if something relevant changed**[github.com](https://github.com/jotaijs/jotai-scope/issues/25#:~:text=Note%20that%20I%20purposely%20do,as%20for%20the%20parent%20component) – either its dependencies or because it was intentionally given a new context. If neither is true, it will not run redundantly.

![](https://www.google.com/s2/favicons?domain=https://jotai.org&sz=32)

Sources

You: 

Notes: 1. We copy atoms so that the copy is the key to the scoped state. All scoped state still lives in the closest ancestor Jotai Provider or global default store. 2. Implicit dependent atoms (unscoped atoms that depend on explicit scoped atoms) can themselves be inherited to the nearest level of their inherited dependencies. 3. Do not inherit implicit dependent atoms of they depend on an explicit scoped atom (deep). 4. ReadAtomState evaluation starts by clearing the atom dependencies. First read on mount (virgin read) can have scoped or unscoped dependencies. Next read is a result of dependencies value change(s). Dependencies can change between read, so it is possible for an atom to flip between implicit dependent and unscoped every time its dependency changes value. I believe that it would be most intuitive for this bi-stable case to be respected. 5. jotai-scope should add custom buildingBlocks for internal functions that keep a copy of the atomState before it was mutated in the atom read. That way, when a scoped atom is read, we can revert the changes on the unscoped atomState. 6. What about async get calls to scoped atoms? 7. Dependent scoped atoms do not share implicit scoped atoms. They instead read the inherited/unscoped versions of those atoms.

ChatGPT: 

Thought for 3m 14s

Love these notes, they actually nail the shape of the problem. Let me walk through how I’d adapt the design given 1–7 and sketch a concrete approach that fits all of them.

I’ll go point-by-point, then propose an overall algorithm.

---

## 1\. “We copy atoms so that the copy is the key to the scoped state”

✅ Totally aligned. Let’s cement this as the **core invariant**:

-   **Atom configs remain the keys**, and the **store is the same** (the closest Jotai Provider or the default store). [Jotai+1](https://jotai.org/docs/core/store?utm_source=chatgpt.com)
    
-   Scoping is implemented by **creating copy atoms** (clones) and using those as keys into the same store:
    
    -   Original: `a`
        
    -   Scoped copy in some scope `S`: `a@S`
        
-   `ScopeProvider` just swaps what atom you pass to the store:
    
    -   Outside scope: `useAtom(a)`
        
    -   In scope S: `useAtom(a@S)` if `a` is explicitly scoped there; otherwise `useAtom(a)` (inherited).
        

Crucially: **no extra store per scope**. All state lives in the nearest Provider store; scopes are purely “atom remapping”.

---

## 2 & 3. Implicit dependents and inheritance depth

> 2.  Implicit dependent atoms (unscoped atoms that depend on explicit scoped atoms) can themselves be inherited to the nearest level of their inherited dependencies.
>     
> 3.  Do not inherit implicit dependent atoms if they depend on an explicit scoped atom (deep).
>     

Let’s define this more precisely in terms of “depth”:

-   Treat each `ScopeProvider` as a **scope level** `L = 1, 2, 3, …` going down the tree.
    
-   For each atom `X`, we can talk about a **“influence depth”** of `X` in a particular evaluation:
    
    -   Look at all *explicitly scoped atoms* in its *transitive dependency closure* for that evaluation.
        
    -   Let `depth(X)` = **max scope level where any explicit dependency lives**, or `0` if there are none (purely global / inherited).
        

Then:

-   If `depth(X) = 0` → `X` is **purely unscoped**. It never needs a scoped copy.
    
-   If `depth(X) = k > 0`:
    
    -   That means: *“To compute `X` correctly, you need to see the explicit scoped atoms at level `k`.”*
        
    -   So `X` belongs to level `k` and should have a clone `X@k` whose state is keyed at that level.
        
    -   Any scope **at or below** `k` should inherit `X@k` (they share the same scoped dependent).
        
    -   Any scope **above** `k` must not see `X@k` — they see the global or higher-level version (`X@k-1`, or `X@0` if none).
        

That’s exactly your:

-   “Inherited to the nearest level of their inherited dependencies” → they inherit from the **closest scope level that has all the explicit deps**.
    
-   “Do not inherit implicit dependents… if they depend on an explicit scoped atom (deep)” → they can’t cross above that explicit level.
    

So the rule becomes:

> For a derived `D` in a scope at level `L`, resolve its **effective atom key** as `D@depth(D)` where `depth(D) = max explicit dependency level`, with:
> 
> -   `depth(D) = 0` → use original `D`
>     
> -   `0 < depth(D) ≤ L` → use `D@depth(D)`
>     
> -   `depth(D) > L` can’t happen (you can’t depend on a deeper explicit than you are).
>     

The nice thing: once we know `depth(D)` for a particular eval, we know **exactly** which clone to use and which scopes may inherit it.

---

## 4\. Dependencies change between reads (bi-stable classification)

> Dependencies can change between read, so it is possible for an atom to flip between implicit dependent and unscoped every time its dependency changes value. I believe that it would be most intuitive for this bi-stable case to be respected.

This is the gnarly one, but we can make it principled:

-   Jotai recomputes dependencies on every evaluation by **clearing deps**, running `read`, and then recording what was `get`’d. [Jotai](https://jotai.org/docs/guides/core-internals?utm_source=chatgpt.com)
    
-   So for each run we compute a *fresh* `depth(D)`.
    

Consequence:

-   On one evaluation, `D` might call `get(scopedA)` and have `depth(D)=k>0`.
    
-   On the next evaluation, maybe the branch doesn’t call `get(scopedA)`, so `depth(D)=0`.
    

You’re saying: **let that be real.** So:

-   We **do not “pin”** `D` forever as “scope-influenced” after its first read.
    
-   Instead, on each evaluation we:
    
    1.  Compute the new dependency set.
        
    2.  Compute the new `depth(D)`.
        
    3.  Decide whether to treat this run as updating `D`’s **global state** or its **scoped clone state**.
        

That leads directly into your #5: we need the ability to **roll back mutations** to the “wrong” state if we decide after the read that this particular evaluation belongs to a different depth than last time.

---

## 5\. Using buildingBlocks to snapshot and revert atomState

> jotai-scope should add custom buildingBlocks for internal functions that keep a copy of the atomState before it was mutated in the atom read. That way, when a scoped atom is read, we can revert the changes on the unscoped atomState.

This is exactly what Jotai’s internal *building blocks* unlock. The internal API behind a store exposes low-level primitives via an internal symbol (`INTERNAL_getBuildingBlocks(store)`), giving access to functions like `readAtomState`, `setAtomState`, and the atom dependency map. [Daishi Kato Newsletter+1](https://newsletter.daishikato.com/p/learn-how-jotai-uses-a-symbol-for-internal-api?utm_source=chatgpt.com)

We can use that like this (conceptually):

### A. Setup

-   From the Jotai store in the nearest Provider, call `INTERNAL_getBuildingBlocks(store)` to get:
    
    -   `getAtomState(atom)`
        
    -   `setAtomState(atom, atomState)`
        
    -   `readAtomState(atom, options)` (or equivalent)
        
    -   plus any helpers we need.
        
-   For each original atom `A`, we may maintain multiple logical `atomState`s:
    
    -   `state(A@0)` for the global/unscoped version.
        
    -   `state(A@k)` for the “scoped influenced” version at depth `k`.
        

But remember: **the store’s internal map is keyed only by the atom object**, so:

-   We create **physical atom copies** (`A0`, `A@1`, `A@2`, …) as separate atom configs.
    
-   Each copy has the same `read` function, but Jotai will internally track separate `atomState` per copy (no additional hacks needed).
    
-   Jotai-scope’s mapping logic in `ScopeProvider` and the scope-aware `useAtom` wrapper will decide which copy to use at runtime.
    

### B. Snapshot + Revert Flow for Derived Atoms

When a derived atom `D` is read via some copy `D*` (e.g. `D` or `D@k`), we:

1.  **Determine the initial target** we think we’re reading:
    
    -   If we’re in scope `L`, we start by assuming `D@L` and calling `readAtomState(D@L)` via buildingBlocks.
        
    -   But for “unscoped usage” we may want `D@0` – see below.
        
2.  Inside the `readAtomState` call, Jotai will:
    
    -   Clear the dependency list for `D*`.
        
    -   Run the `read` function with a `get` that we may wrap to apply scoping behavior. (We can intercept this at the buildingBlocks layer by providing a custom `get` that honors our atom-copy mapping in this scope.)
        
    -   Record deps on `D*`’s `atomState`.
        
3.  **After** `readAtomState` returns, we inspect `D*`’s dependency set to compute `depth(D)` based on which of those dependencies are explicit (or depend on explicit, see 2/3).
    
4.  If our initial guess (`D*`) doesn’t match `depth(D)`:
    
    -   Example: we read `D@L`, but `depth(D)` turned out to be `0` (no scoped deps).
        
    -   Then:
        
        -   Snapshot `state(D@0)` before evaluation (we can pre-snapshot or lazy-snapshot).
            
        -   Move the new value and deps into `D@0` (or rerun the read directly into `D@0`).
            
        -   **Revert** `D@L` to its pre-eval state (so we don’t corrupt the scoped copy with an evaluation that should belong to the global version).
            
5.  For subsequent reads, we may skip the wrong-target path by consulting a cache:
    
    -   e.g. store the last known `depth(D)` per scope level and call `readAtomState` on the right copy first.
        
    -   Still, we must be prepared for the bi-stable flip and fallback to snapshot+revert when `depth(D)` changes.
        

This matches your requirement: we’re “keeping a copy of atomState before it was mutated” so we can revert misdirected writes after we know which depth this evaluation belongs to.

---

## 6\. “What about async get calls to scoped atoms?”

Key point from Jotai’s **effect** docs (and the same principle applies to derived dependencies): **async `get` calls don’t add dependencies**. Only synchronous `get` calls inside the main run are used to compute dependencies. [Jotai](https://jotai.org/docs/extensions/effect?utm_source=chatgpt.com)

That gives us a clean way to reason about scoping:

-   For dependency tracking and deciding `depth(D)`, we only care about the **sync phase** of `D`’s read function:
    
    -   The `get` calls before the first `await`.
        
    -   Those are the ones Jotai’s `readAtomState` sees and stores in `deps`.
        
-   Async `get`s (inside `setTimeout`, after an `await`, etc.) do not affect dependency lists, so they **should not affect classification** (`implicit dependent` vs `unscoped`).
    

Implementation-wise:

-   Our scoping wrapper around `get` needs to:
    
    -   Always return the right *value* for a scoped atom in the current scope, regardless of sync/async.
        
    -   But since dependency collection only happens for sync calls, we don’t have to worry about async calls altering the deps that we later inspect.
        

So for async atoms:

-   The classification (`depth(D)`) is determined by which atoms you touch synchronously.
    
-   As long as our `get` wrapper routes the value correctly (if the dependency is explicit or implicit at some depth), async code “just works”: it reads the right value but doesn’t change which atom copy we use for dependency tracking.
    

The only caveat: for async atoms that **suspend** (return a promise), make sure our snapshot+revert logic runs **once per `readAtomState` call** (i.e. per attempt), not per eventual promise resolution. That’s consistent with how `readAtomState` works internally: it returns with the promise and the dependency set immediately, and future re-runs happen when the promise resolves/rejects.

---

## 7\. “Dependent scoped atoms do not share implicit scoped atoms”

> Dependent scoped atoms do not share implicit scoped atoms. They instead read the inherited/unscoped versions of those atoms.

This fits a **simpler model** than what the original jotai-scope docs describe (where implicit deps are shared and “scoped only inside the derived’s read” [GitHub](https://github.com/jotaijs/jotai-scope?utm_source=chatgpt.com)). You’re explicitly choosing:

-   Only **explicit** atoms are truly scoped (i.e., get actual clones like `a@S` keyed in the store).
    
-   Derived atoms that depend on explicit atoms become **implicit dependents**, but:
    
    -   We only clone **the derived** itself (`D@k`), not its primitive dependencies.
        
    -   Those clones read the **inherited/unscoped versions** of the primitives:
        
        -   If a dependency `a` is explicit at level `k`, that means the “inherited/unscoped version at level `k`” is `a@k`.
            
        -   If `a` is not explicit at level `k`, we just use the original `a` (or whatever level it’s explicitly scoped at).
            

In other words:

-   We do **not** create new “implicit a@k’2” just because `c` and `d` are scoped in S2 and both touch `a`.
    
-   `c@2` and `d@2` both just read whichever `a` is visible at their level:
    
    -   If `a` was explicit in S1 only, they both read `a@1` (inherited from S1).
        
    -   If `a` is explicit in S2, they both read `a@2`.
        
    -   If `a` is never explicit, they both read `a`.
        

This matches your statement: they “read the inherited/unscoped versions of those atoms.” We have **no implicit scoped primitives**, only implicit **derived** clones.

That simplifies things a lot:

-   The “implicit dependent atoms” in your notes are **derived atoms whose `depth(D)>0`**, not primitives.
    
-   We can focus all the clone/snapshot logic on deriveds.
    

---

## Putting it all together: a concrete algorithm

Here’s a concrete design that satisfies 1–7:

### Data structures

Per Jotai Provider store:

-   `explicitScopes: Map<ScopeId, Set<Atom>>`
    
-   `clones: Map<Atom, Map<number /* depth */, AtomClone>>`
    
    -   `clones[D].get(0)` is the original `D`.
        
    -   `clones[D].get(k)` is `D@k` (a clone atom) for `k>0`.
        
-   `depthCache: Map<AtomClone, number>` (last known depth per clone usage; optional optimization).
    

### ScopeProvider behavior

Each `ScopeProvider`:

-   Gets a `scopeId` and a depth `L`.
    
-   Receives `atoms` to explicitly scope at this level:
    
    -   For each explicit atom `A`, ensure `clones[A].get(L)` exists (`A@L`).
        
    -   The scope context contains a resolver:
        
        ```ts
        function resolveAtom(atom: Atom): AtomClone {
          if (atom is primitive or derived) {
            if (explicitScopes[L].has(atom)) return clones[atom].get(L)!
            // If atom is derived, we may override later based on depth(D)
            // For now, we return the “best guess” clone:
            return clones[atom].get(0)! // original, unscoped
          }
        }
        ```
        
-   The scope-aware `useAtom` uses `resolveAtom` before calling Jotai’s `useAtom`.
    

### Reading a derived atom inside a scope

When React renders and calls `useAtom(D)` inside scope `L`:

1.  `resolveAtom(D)` initially returns the **unscoped** clone: `D0 = clones[D].get(0)` (unless D is explicitly scoped, in which case we start with `D@L`).
    
2.  We call `store.get(D0)` which internally calls `readAtomState(D0)` via buildingBlocks.
    
3.  We override the `get` that `readAtomState` uses so that when `D0` calls `get(someAtom)`:
    
    -   If `someAtom` is explicit at some level `k ≤ L`, we actually call `get(clones[someAtom].get(k))`.
        
    -   Otherwise we call `get(clones[someAtom].get(0))`.
        
4.  After `readAtomState(D0)` returns, we inspect `D0`’s deps and compute:
    
    ```ts
    depth(D) = max over deps dep of ( deepestScopeLevelWhere(dep is explicit) ) || 0
    ```
    
5.  Two cases:
    
    -   **Case A – depth(D) = 0**
        
        -   The value belongs to the **global/unscoped** version.
            
        -   Good: we already wrote into `D0`.
            
        -   If we had started with `D@L` instead, we’d now:
            
            -   Snapshot `D0` state.
                
            -   Move `D@L`’s new value+deps into `D0`.
                
            -   Restore old `D@L` state (revert).
                
    -   **Case B – depth(D) = k > 0**
        
        -   We need a **scoped clone** for `D` at level `k`.
            
        -   Ensure `Dk = clones[D].get(k)` exists.
            
        -   If we computed the value into `D0` by mistake:
            
            -   Snapshot `Dk` state.
                
            -   Move the new value+deps into `Dk`.
                
            -   Restore old `D0` state.
                
        -   Now, we must ensure that from this scope (and any descendant scope) we use `Dk` instead of `D0`:
            
            -   Update some per-scope mapping so that future `resolveAtom(D)` at scopes `≥k` returns `Dk` instead of `D0`.
                
    
    Either way, the component gets the right value; future reads will tend to start from the right clone.
    
6.  On subsequent evaluations, when dependencies change and `readAtomState` for `D*` runs again, we repeat the same process. If `depth(D)` flips from `k` back to `0` (your bi-stable case), we again snapshot+move+revert accordingly.
    

This satisfies:

-   **(1)** We only use atom copies as the keys for scoped state; all state is in the single store.
    
-   **(2)** Implicit dependents (`depth(D)>0`) live at the depth of their deepest explicit dep and are **inherited downwards** (we always choose `D@depth(D)` for all scopes ≥ that depth).
    
-   **(3)** They’re not inherited above that level (scopes above still see `D0`).
    
-   **(4)** We recompute dependencies each time and allow `depth(D)` to change between reads; snapshot+revert keeps the wrong atomState from being mutated.
    
-   **(5)** We use Jotai buildingBlocks to snapshot and revert atomState as part of each `readAtomState` evaluation.
    
-   **(6)** Async `get` calls to scoped atoms still see correct values, but don’t affect `depth(D)` because dependencies are built from sync `get`s only.
    
-   **(7)** We never create implicit scoped primitives; dependent scoped atoms (`D@k`) always read inherited/unscoped versions of primitives (`A@k` if explicit there, or `A@0` otherwise). They don’t share a separate implicit `A@k’2` or similar.
    

---

If you’d like, next step I can:

-   Sketch out the actual TypeScript types for `AtomClone`, `ScopeId`, and the resolver context.
    
-   Or, take a real jotai-scope file (e.g. the current `ScopeProvider` + the internal scope store module) and propose a concrete patch that layers this depth/classification logic on top of the existing clones-per-scope machinery.

You: 

8\. A1 depends on B1 in S1. C0 depends on inherited A1 in S2, but S2 explicitly scopes B2 so even though A1 is inherited, B2 should be respected when read by A in S2. 9. No we also care about async reads to resolve the right atom value despite having no impact on dependencies. The right atomState needs to record that value and not pollute the unscoped atomState. 10. How would we revert changes in the atomState, mounted state, invalidated atoms, changed atoms, when we discover an atom is dependent scoped? 11. Should we apply stickyness to dependent scoped for the lifecycle of the atom (until unmount). Weigh the pros/cons and feasibility of allowing bistable behavior. 12. No dependent scoped atoms do not share / cannot read implicit scoped atoms because they are not explicit or implicit scoped. Explicit and implicit scoped atoms can still read / share implicit scoped atoms. 13. We don’t clone dependent scoped atoms. Instead we handle their scoping by resolving the correct atomState. When an atom reads a dependent atom’s state, we check if that atom is in the dependent state map and fetch its atomState from there instead.

ChatGPT: 

Thought for 2m 22s

Nice, these extra constraints sharpen the picture a lot. I’ll walk through each of 8–13, and adjust the earlier design so it matches what you’re actually going for (no dependent-atom cloning, dynamic routing of atomState, async correctness, etc.).

---

## 8\. The S1 / S2 example (A1 depends on B1, then S2 introduces B2)

> 8.  A1 depends on B1 in S1. C0 depends on inherited A1 in S2, but S2 explicitly scopes B2 so even though A1 is inherited, B2 should be respected when read by A in S2.
>     

Let’s name things:

-   Root (L0): `A0`, `B0`, `C0` – original atoms.
    
-   Scope S1 (L1):
    
    -   Explicit: `B` → `B1` (we’ve cloned B for S1).
        
    -   `A` *depends* on B. When evaluated in S1, `get(B)` resolves to `B1`, so “A1” is effectively `A` + “dependent scoped at level 1”.
        
-   Scope S2 (L2), nested under S1:
    
    -   Explicit: `B` → `B2` (clone for S2).
        
    -   `C0` depends on “inherited A” (you do **not** explicitly scope A in S2).
        

What we want:

-   When `C0` runs in S2 and calls `get(A)`:
    
    -   That read of A should see B2, not B1, even though A is “inherited”.
        
    -   I.e. A’s *body* is evaluated in the **context of S2**, so its `get(B)` should resolve to the B that’s explicit in S2.
        

So under the “no cloning dependent atoms” rule, A has:

-   A **single atom config** (no `A2` clone).
    
-   Multiple **atomState variants**, keyed by some notion of “scope context”:
    
    -   Global/unscoped: `A_state@L0` (uses B0).
        
    -   Dependent scoped for S1: `A_state@S1` (uses B1).
        
    -   Dependent scoped for S2: `A_state@S2` (uses B2).
        

Mechanically, when `C0` in S2 calls `get(A)`:

1.  We start a `readAtomState(A)` evaluation with a *scope context* of S2.
    
2.  The scope-aware `get` inside that evaluation resolves `get(B)` to **B2** (because B is explicit at S2).
    
3.  After the sync dependency pass, we classify A as “dependent scoped at S2” (it has an explicit dep at level 2).
    
4.  We store the resulting atomState in the **dependent map entry for (S2, A)**, *not* in the global/unscoped one.
    
5.  `C0` reads value from `A_state@S2`.
    

In S1, reading A would do the same thing, but the scope context is S1, so `get(B)` resolves to B1 and we store into `(S1, A)`.

Result:

-   Same `A` atom, multiple “views” depending on where it’s read.
    
-   Inherited A is *logically* the same atom, but its state is context-sensitive because its dependencies are.
    

This matches your requirement exactly.

---

## 9\. Async reads must still land in the right atomState

> 9.  No we also care about async reads to resolve the right atom value despite having no impact on dependencies. The right atomState needs to record that value and not pollute the unscoped atomState.
>     

Right: dependency tracking is sync-only, but **the place where we store the result** (value/promise/error) must reflect the scope classification.

So the sequence for a derived `D` (sync or async):

1.  Run the **sync phase** of `readAtomState(D)` under scope S, using scope-aware `get`.
    
2.  Collect sync dependencies → compute classification:
    
    -   `D` is:
        
        -   **unscoped** (no explicit deps in chain), or
            
        -   **dependent scoped at scope Sx** (nearest explicit level in its chain), or
            
        -   (explicit/implicit scoped – separate category)
            
3.  Decide **target state map** *before* committing any changes:
    
    -   unscoped → global/unscoped state map.
        
    -   dependent scoped → `dependentStateMap[Sx][D]`.
        
    -   explicit/implicit → scoped state map (keyed by copied atom).
        

Once we’ve chosen a target, **everything** for this evaluation goes there:

-   For a *sync* derived: the final value and deps are written there.
    
-   For an *async* derived:
    
    -   The pending promise, its status, and any eventual resolved value/error are all held in that same map.
        
    -   When the promise resolves and Jotai re-runs or finalizes the atom, that continuation needs to run with the same target-state choice we made in step 3.
        

So practically:

-   We treat “classification” as a **per-evaluation context tag** (e.g., `evalContext.target = "unscoped"` or `"dependent:S2"`).
    
-   When Jotai’s internals schedule any asynchronous continuation (e.g. after a promise resolves), we ensure that continuation runs with the same `evalContext.target` so it writes back into the same map.
    

That way async never “leaks” a dependent result into the unscoped map, or vice versa.

---

## 10\. How to revert / avoid wrong writes to atomState, mount state, invalidated / changed sets

> 10.  How would we revert changes in the atomState, mounted state, invalidated atoms, changed atoms, when we discover an atom is dependent scoped?
>     

You have two options:

### Option A: Transactional evaluation (preferred)

Instead of “write then revert”, treat each `readAtomState` as a **transaction**:

-   Wrap the buildingBlocks for:
    
    -   atomState writes (set value/error/promise, deps, etc.),
        
    -   mount/unmount updates,
        
    -   invalidatedAtoms / changedAtoms bookkeeping.
        

into a layer that writes into a *temporary buffer* during the evaluation.

Sketch:

```ts
type Transaction = {
  target: "unscoped" | { type: "dependent"; scopeId: ScopeId },
  atomStateChanges: Map<Atom, AtomState>,
  mountedChanges: ...,
  invalidatedChanges: ...,
  changedChanges: ...,
}
```

Algorithm:

1.  When `readAtomState(atom, scopeCtx)` begins:
    
    -   Start a new Transaction with a *provisional* target (e.g. `"unscoped"`).
        
    -   Wrap buildingBlocks so all writes go into `transaction.atomStateChanges` etc, not into real store structures.
        
2.  Run the read:
    
    -   All `setAtomState`, “mark invalidated”, “mark changed”, and “mount” operations only modify the transaction’s buffers.
        
3.  After evaluation:
    
    -   Inspect deps → compute classification (unscoped vs dependent(Sx) vs explicit/implicit).
        
    -   Update `transaction.target` accordingly.
        
4.  **Commit**:
    
    -   For unscoped: apply all transaction changes to the global Jotai store maps.
        
    -   For dependent(Sx): apply them to your `dependentStateMap[Sx]` and any auxiliary sets you maintain for dependent atoms.
        
    -   For explicit/implicit: commit into the scoped copied-atom map.
        
5.  Clear the transaction.
    

Advantages:

-   You don’t have to revert anything; you never touched the “real” state until you knew where it belongs.
    
-   Mounted state, invalidated sets, changed sets – all stay consistent, because they are also applied in one place at commit time.
    
-   This works cleanly for both sync and async: the transaction is per `readAtomState` invocation (including the “promise is pending” evaluation), not per React render.
    

### Option B: Snapshot + revert (more invasive, error-prone)

If you *don’t* want the transaction layer, you can:

-   Before evaluation, snapshot:
    
    -   atomState for that atom,
        
    -   global “mountedAtoms” flags for that atom,
        
    -   invalidatedAtoms / changedAtoms entries for that atom.
        
-   After classification:
    
    -   If the evaluation belongs to a different region than the one you wrote into, copy the new state into the correct map, then restore all the snapshots in the original map.
        

Problems:

-   It’s easy to miss some internal structure (e.g. unresolved dependencies, subscription graphs).
    
-   You also need to snapshot & revert for every atom touched transitively if the evaluation triggers writes to other atoms.
    

Given how subtle Jotai’s internals already are, a **transaction layer is safer** and conceptually cleaner, especially since you’re okay modifying Jotai internals.

---

## 11\. Sticky vs bi-stable dependent scoped behavior

> 11.  Should we apply stickyness to dependent scoped for the lifecycle of the atom (until unmount). Weigh the pros/cons and feasibility of allowing bistable behavior.
>     

Two possible behaviors:

### Bi-stable (what you described earlier)

On *every* evaluation:

-   You recompute deps from scratch.
    
-   You re-classify:
    
    -   `D` is unscoped this time if it didn’t touch any scoped deps.
        
    -   `D` is dependent scoped if it did.
        

So `D` can bounce between:

-   “lives in unscoped map” and
    
-   “lives in the dependent map for Sx”
    

depending on control flow.

**Pros:**

-   Most “intuitive” if you think of atoms as pure functions of their current dependency graph.
    
-   If a branch stops touching scoped atoms, `D` literally stops being scope-influenced and collapses back to a single global value.
    

**Cons:**

-   Implementation complexity (unless you do the transaction approach).
    
-   Potentially confusing for debugging: logs / devtools show the same atom toggling between “global” and “scoped” state depending on runtime paths.
    
-   More churn: you may repeatedly move state between maps (though with transactions it’s just “commit here vs there”).
    

### Sticky (once dependent scoped, always dependent scoped in that scope)

Once you discover `D` is dependent scoped in Sx:

-   For that scope, mark `D` as “sticky dependent”.
    
-   All future evaluations of `D` in Sx:
    
    -   Are **always written** to `dependentStateMap[Sx][D]`, even if the next evaluation’s deps are purely unscoped.
        

You can still use the full dependency graph for invalidation, but the *placement* of state is sticky.

**Pros:**

-   Simpler state placement logic.
    
-   You don’t need to move state back/forth between maps.
    
-   Debugging is easier: `D` is “scoped here” for the life of that scope.
    

**Cons:**

-   Semantics are slightly less “pure”: if a branch stops touching scoped deps, you still keep a per-scope view of `D` instead of collapsing back to the global one.
    
-   Edge case: a parent might update `D` in the unscoped context, which no longer affects Sx because Sx has its own sticky version. That might be surprising in some designs.
    

### Feasibility

With the transaction layer, **both** are feasible:

-   Bi-stable: decide target map every evaluation; commit accordingly.
    
-   Sticky: store a flag per (scope, atom) once you see it dependent; after that, always set the target to dependent, regardless of current deps.
    

Given your note *“I believe it would be most intuitive for this bi-stable case to be respected”*, I’d lean:

-   **Default behavior:** bi-stable (matches your mental model and Jotai’s dynamic deps).
    
-   **Optional optimization:** you *could* flip to sticky after N dependent-evals if you ever find this is a perf hotspot, but I’d keep it simple at first and stay bi-stable.
    

---

## 12\. Sharing semantics: who can read implicit scoped atoms?

> 12.  No dependent scoped atoms do not share / cannot read implicit scoped atoms because they are not explicit or implicit scoped. Explicit and implicit scoped atoms can still read / share implicit scoped atoms.
>     

So we effectively have **three categories**:

1.  **Explicit scoped atoms**
    
    -   Listed in `ScopeProvider`.
        
    -   Implemented as **copied atoms** with scoped atomState.
        
2.  **Implicit scoped atoms**
    
    -   Created when evaluating an explicit scoped atom (or an implicit that chains).
        
    -   Also implemented as **copied atoms** (those copies are the keys to their scoped state).
        
    -   Shared *only* among explicit/implicit scoped atoms in that scope tree.
        
3.  **Dependent scoped atoms**
    
    -   Original atoms whose evaluations discover scoped deps, but:
        
        -   We **do not clone** them.
            
        -   We don’t treat them as “scoped” for the implicit-scoping rules.
            
        -   Instead, we give them per-scope atomState overlays (dependent maps).
            

Then:

-   Explicit & implicit scoped atoms can see each other’s implicit versions.
    
-   Dependent scoped atoms **always** resolve primitives via the usual scope resolution:
    
    -   If `B` is explicit somewhere, they see that explicit.
        
    -   But they never create new “implicit B” just because they exist.
        

That’s consistent with your S1/S2 example: A (dependent scoped) does not generate a new implicit B; it just uses the explicit B that’s already in effect in the current scope.

---

## 13\. No cloning dependent scoped atoms — dependent state map design

> 13.  We don’t clone dependent scoped atoms. Instead we handle their scoping by resolving the correct atomState. When an atom reads a dependent atom’s state, we check if that atom is in the dependent state map and fetch its atomState from there instead.
>     

So the final picture is:

### Data structures (per Provider store)

-   **Core Jotai internals** (unchanged):
    
    -   `atomStateMap: Map<Atom, AtomState>` – the *unscoped* global map.
        
    -   `mountedAtoms`, `pendingAtoms`, `changedAtoms` etc.
        
-   **Scoped-state maps** (for explicit & implicit):
    
    -   Each scoped atom is a **cloned atom object**, so its state lives in `atomStateMap` with that cloned key.
        
    -   No extra structure required: Jotai just sees more atoms.
        
-   **Dependent-state maps** (new):
    
    -   `dependentStateMap: Map<ScopeId, Map<Atom, AtomState>>`
        
    -   Optionally plus some per-scope bookkeeping (e.g. to know which dependent atoms exist in that scope).
        

### readAtomState / getAtomState wrappers

When any atom `X` is read in a scope S:

1.  If `X` is a **copied scoped atom** (explicit or implicit):
    
    -   You use Jotai’s normal `atomStateMap.get(XCopy)`.
        
2.  Else if `X` is an **original atom**:
    
    -   First look into `dependentStateMap[S].get(X)`:
        
        -   If present → use that as `X`’s current atomState in this context.
            
    -   Otherwise → fall back to the global `atomStateMap.get(X)`.
        

When you evaluate a derived `D` as an original atom in S:

-   You run the transactional `readAtomState(D)` under scope context S.
    
-   After evaluation, classify D:
    
    -   If unscoped → commit transaction changes into global `atomStateMap` for D.
        
    -   If dependent scoped at S → commit into `dependentStateMap[S][D]`.
        

Any later reads of `D` in S will then pick that up.

### Writes and notifications

When an atom’s value actually changes (after commit):

-   You still use Jotai’s existing subscription mechanism keyed by **atom identity**.
    
-   The difference is: when dependents or components call `get(D)` in scope S, the `getAtomState` wrapper will pick:
    
    -   `dependentStateMap[S][D]` if it exists,
        
    -   otherwise `atomStateMap[D]`.
        

So the notification pipeline doesn’t change; only where we *look* for the current state of an atom changes.

This also plays nicely with nested scopes:

-   If `dependentStateMap[S2][D]` doesn’t exist but `dependentStateMap[S1][D]` does, a strict “nearest scope” lookup (S2 → S1 → root) will let D in S2 inherit the dependent state from S1, if that’s the semantics you choose.
    
-   Or you can say dependent-state is **per-scope only, not inherited**, and always fall back straight to global if there is no local entry. That’s an extra design knob; your note 2 about “nearest level” suggests you prefer inheritance across scope levels.
    

---

If you’d like, next I can:

-   Turn this into a more concrete “internal API shape”: a `createScopedStore(buildingBlocks)` that wraps Jotai’s store with all the transactional + dependentState logic; or
    
-   Sketch out how a specific Jotai internal function (`readAtomState` / `mountAtom`) would be wrapped to implement the transactional evaluation and dependent state maps while keeping current jotai-scope public API unchanged.

You: 

14\. Use this style notation in discussing atom - scope topographies.

```
S0[ ]: A0, B0, C0(A0 + B0), D0(C1)
S1[C]: A0, B0, C1(A1 + B1), D1(C1)
S2[ ]: A0, B0, C1(A1 + B1), D1(C1)
S3[A]: A3, B0, C3(A3 + B1), D3(C3)
```

15\. How should we handle atom references if we are not cloning dependent scoped atoms? For example, the set ChangedAtoms lists atom C, but then which atom C? The information needs to somehow be preserved. Perhaps we do clone dependent scoped atoms, but then we would need to hot-swap to the clone’s state when the atom reads an explicit. Then we replace references to the atom with the clone. 16. Transaction writes seems nice and seems to fit well into the flushCallbacks final step of the jotai store transaction, but recomputeDependents needs those values and the knowledge of what changed ahead of flushCallbacks. 17. Async reads changing the atom’s classification is another problem if prior to that read, side-effects such as React rerenders were performed. How can we mitigate learning late about a dependent scoped classification?

ChatGPT: 

Thought for 3m 21s

Alright, let’s tighten this up and fold 14–17 into a coherent story.

I’ll do:

-   Use your `S0[...]` notation to restate the tricky topography.
    
-   Tackle 15–17 one by one and adjust the design where needed.
    

---

## 14\. Using the `S0[...]` topography notation

I’ll use this notation:

```txt
S0[ explicit list ]: A0, B0, C0(...), D0(...)
S1[ explicit list ]: A?, B?, C?, D?
```

Where:

-   `Si[...]` = scope level `i`.
    
-   Brackets `[...]` list **explicit** scoped atoms in that scope.
    
-   `Xk` means “X is evaluated with the dependency environment of level `k`” – i.e. “X’s classification depth is k”.
    
-   The parentheses indicate dependencies (using the `Ak + Bk` style).
    

So your example:

```txt
S0[ ]: A0, B0, C0(A0 + B0), D0(C1)
S1[C]: A0, B0, C1(A1 + B1), D1(C1)
S2[ ]: A0, B0, C1(A1 + B1), D1(C1)
S3[A]: A3, B0, C3(A3 + B1), D3(C3)
```

You can read as:

-   **S0\[ \]**: No explicit atoms.
    
    -   `A0`, `B0` – global.
        
    -   `C0(A0 + B0)` – global `C` depending on global `A`, `B`.
        
    -   `D0(C1)` – global `D`, but logically “classified at depth 1” because it depends (somewhere) on `C1` (scope 1’s C). So even in S0, it’s *influenced* by S1’s scoping.
        
-   **S1\[C\]**:
    
    -   `C` is explicit here, so `C1(A1 + B1)` – “C at depth 1 reads A1 & B1”.
        
    -   `A1`/`B1` might be *implicit* (or dependent) at depth 1.
        
    -   `D1(C1)` – `D` evaluated at depth 1 (S1) and now depends on `C1`.
        
-   **S2\[ \]**:
    
    -   No explicit atoms, but it sits under S1, so it inherits `C1(A1 + B1)`, `D1(C1)`.
        
-   **S3\[A\]**:
    
    -   `A` is explicit here → `A3`.
        
    -   `C3(A3 + B1)` – `C` evaluated at depth 3 now depends on `A3` and `B1`.
        
    -   `D3(C3)` – `D` at depth 3, depending on that new `C3`.
        

This is exactly the kind of topography we want to reason about when we classify atoms by “depth” and decide where their state lives.

---

## 15\. What about atom references / changedAtoms if we *don’t* clone dependent atoms?

> If we are not cloning dependent scoped atoms, `changedAtoms` just says “C changed” – but *which* C? Maybe we need to clone dependent scoped atoms and hot-swap.

This hits an important tension:

-   Internally, Jotai’s dependency graph and `changedAtoms` list are keyed by **atom object identity** (the config object). [Jotai](https://jotai.org/docs/guides/core-internals)
    
-   Jotai’s `recomputeDependents` logic (simplified) is:  
    “for each changed atom `a` → for each dependent `d` in `aState.dependents` → re-run `readAtomState(d)`”. [Jotai](https://jotai.org/docs/guides/core-internals)
    

If we try a pure “dependent overlay map” with *no cloned atom identities*:

-   `changedAtoms` will only ever contain the *original* `C`.
    
-   Every dependent atom (including any scoped variant) is also just `C` as far as the store is concerned.
    
-   You can route **values** per-scope (via a scoped `get`), but:
    
    -   Jotai’s internals are not scope-aware.
        
    -   There is exactly one `dependents` set for `C`, exactly one `atomState` entry for `C` in the core store.
        

This is where it gets ugly:

-   Different scopes need *different* `atomState` for the same `C`, but the core store only has one `atomState(C)`.
    
-   If we push “per-scope state” out into a side map (`dependentStateMap`), `recomputeDependents` still only ever sees the **global** `atomState(C)`, so it will:
    
    -   Recompute dependents as if there’s only one `C`.
        
    -   Have no idea which scope’s variant changed.
        

You *can* try to patch this by writing a fat shim around `readAtomState` that knows about scopes, but Jotai’s `recomputeDependents` calls `readAtomState(atom)` with **no scope information**. There’s just not enough information at that level to choose “S1’s C” versus “S3’s C”. So:

> **Conclusion:** if you want Jotai’s built-in dependency tracking (`dependents`, `changedAtoms`, `invalidatedAtoms`, `recomputeDependents`) to work naturally, you need **distinct atom identities** for distinct scoped / dependent variants.

That’s exactly what you already do for explicit/implicit scoped atoms (copy atoms so the copy is the key to scoped state). So for dependent scoped atoms, the most internally-compatible path is:

-   **Yes, we *do* clone dependent scoped atoms**, but:
    
    -   Only when we actually detect they are dependent-scoped in a scope.
        
    -   We do it lazily and transactionally.
        
    -   We “hot-swap” the evaluation to that clone while preserving user-facing semantics.
        

In notation:

```txt
S0[ ]:  C0(A0 + B0)
S1[B]:  C1(A1 + B1)          // C1 is an explicit or implicit clone
S2[ ]:  C1(A1 + B1)          // inherits C1
S3[A]:  C3(A3 + B1)          // new dependent-scope clone at level 3
```

Where:

-   `C0`, `C1`, `C3` are **distinct atom objects**.
    
-   The user just writes `useAtom(C)`; jotai-scope resolves that to:
    
    -   `C0` in S0,
        
    -   `C1` in S1/S2,
        
    -   `C3` in S3.
        

That way:

-   `changedAtoms` contains **the right clone**.
    
-   `aState.dependents` for each clone is accurate.
    
-   `recomputeDependents` works unchanged.
    

So your “maybe we do clone dependent scoped atoms” instinct is, in my view, the correct one if you want to lean on Jotai’s existing internals instead of rebuilding `recomputeDependents` yourself.

The “hot-swap” story then becomes:

-   On the first read where we learn “oh, C is actually dependent-scoped in S3”, we:
    
    1.  Create `C3` (clone of `C`) if it doesn’t exist.
        
    2.  Evaluate into `C3`’s `atomState` (transactionally) instead of `C0`’s.
        
    3.  Ensure that for scope S3, `ScopeProvider` now resolves `C` → `C3` for `get`, `set`, and `sub`.
        

Because you own the `ScopeProvider` hooks, you can make sure **React subscriptions are always created against the resolved clone** for that scope. You don’t have to rewrite Jotai’s own `<Provider>` or `useAtom`.

---

## 16\. Transactions vs `recomputeDependents` / `flushCallbacks`

> Transaction writes seem nice and fit well into `flushCallbacks`, but `recomputeDependents` needs those values and knowledge of what changed *before* `flushCallbacks`.

This is a really good subtlety.

The rough order in modern Jotai internals is (simplified):

1.  A write / dependency invalidation happens.
    
2.  Internals update `atomState` and collect:
    
    -   which atoms are invalidated,
        
    -   which atoms changed.
        
3.  `recomputeDependents` runs, re-reading derived atoms that depend on changed ones (i.e., it calls `readAtomState` recursively). [Jotai](https://jotai.org/docs/guides/core-internals)
    
4.  At the very end of a batch, `flushCallbacks`/`flushStoreHooks` fire, notifying subscribers (React components, devtools, etc.).
    

If we try to have a **big outer “transaction”** that only commits at `flushCallbacks` time:

-   During step 3 (`recomputeDependents`), the core store would still only see the *old* state if our transaction hasn’t been applied yet.
    
-   That’s not acceptable: derived atoms need to see the newly written values to recompute correctly.
    

So the “transaction” has to be **inside** Jotai’s evaluation steps, not outside them. That suggests this shape:

### Per-atom-evaluation transactions, not store-global

When Jotai calls `readAtomState(C0)`:

1.  Our building-blocks wrapper starts a *local* transaction for this **single atom evaluation**:
    
    -   Writes go to a buffer.
        
2.  We run the `read` function (which may read B, A, etc.).
    
3.  Once we know the classification (unscoped vs explicit vs dependent-scoped Sx), we **immediately commit**:
    
    -   The buffered state to the correct `atomStateMap`:
        
        -   `C0` (unscoped),
            
        -   or `C1`, `C3` clone (scoped / dependent).
            
    -   The “changedAtoms” entry pointing at that specific atom object.
        
4.  That commit happens *before* `recomputeDependents` ever sees it.
    

Then, `recomputeDependents` proceeds as usual:

-   It looks at `changedAtoms`.
    
-   For each `C3` there, it calls `readAtomState` (which will see the new committed `atomState(C3)` and propagate further).
    

`flushCallbacks` stays where it was: at the end of the whole batch, notifying React and other subscribers. That’s where a “store-global transaction” *already* lives in Jotai’s design; we’re not displacing it, we’re just:

-   Adding a **per-evaluation transaction** that decides *which atom identity* (`C0`, `C1`, `C3`) to commit to;
    
-   Ensuring the commit happens before Jotai’s own recompute-and-flush pipeline.
    

So:

-   **Good news:** your transaction idea is compatible with `recomputeDependents` as long as the commit to the correct atom clone happens **inside `readAtomState`** before we mark changed atoms and kick off recompute.
    
-   **Bad news:** a big “delay everything until `flushCallbacks`” outer transaction would be too late for dependency propagation.
    

---

## 17\. Async reads + “late” classification & side effects

> Async reads changing the atom’s classification is another problem if prior to that read, side-effects such as React rerenders were performed. How can we mitigate learning late about a dependent scoped classification?

There are two separate “lateness” axes here:

1.  **Late in time within the same evaluation:**
    
    -   Dependency tracking in Jotai happens during the sync part of the read function (before the first `await`). [GitHub+1](https://github.com/pmndrs/jotai/discussions/1776?utm_source=chatgpt.com)
        
    -   That means classification (unscoped vs dependent) must be decided **as soon as the sync part finishes**, *before* we commit any state or mark the atom changed.
        
    -   Async continuations (after the `await`) will run later, but they already know which atom identity they belong to (C0 vs C3) because that was fixed when the pending promise was first registered.
        
2.  **Late in the lifecycle:**
    
    -   A scope might initially read `C` in a purely unscoped way (`depth(C)=0`), causing `C0` to be used.
        
    -   Later, some code path in that same scope reads `C` and now touches a scoped dependency, discovering `depth(C)=3` and forcing us to promote to `C3`.
        
    -   Meanwhile, React may already have re-rendered components using the unscoped version earlier.
        

You can’t retroactively stop those earlier rerenders from having happened. But you can:

### a) Classify before notifying React

Because Jotai only notifies subscribers at the end of a batch (`flushCallbacks`/`storeHooks`), and classification + commit happens **inside `readAtomState`**, we can guarantee:

-   Whenever React is told “C changed”, we have already:
    
    -   Picked the correct atom identity (C0 vs C3).
        
    -   Written the value into that identity’s `atomState`.
        
    -   Marked that identity in `changedAtoms`.
        

So you never have the specific bug “React re-rendered based on C0, and *only then* did we discover we should have used C3”.

What you *can* have is:

-   Frame N: C is used only unscoped → React uses C0.
    
-   Frame N+M: some new code path touches C with a scoped dep → we discover C3, commit to C3, and from now on, scope S3’s `useAtom(C)` resolves to `C3` and sees the scoped view.
    

That’s okay: it’s just the app’s logic changing which dependencies are used.

### b) Sticky classification vs bi-stable, revisited

This is where the sticky vs bi-stable choice bites again. If you allow **full bi-stability**, then:

-   In S3, C could flip:
    
    -   Eval 1: touches scoped A3 → classified as C3, stored under C3.
        
    -   Eval 2: control flow changes, doesn’t touch A3 → classified as depth 0; now we’d want to “pull it back” to C0.
        

In practice:

-   Pulling it back to C0 after React has been rendering based on C3 is semantically weird: you’re effectively saying “this scope no longer has a special view of C” *mid-lifecycle*.
    
-   For async atoms, this is particularly nasty:
    
    -   The initial pending state might be stored under C3.
        
    -   Later, when `await` resolves, if you flip classification back to C0, you need to migrate the resolved value back and forth while some components are subscribed to one identity and others to the other.
        

So for **mitigating weird “late” reclassification with async**, I would recommend:

-   **Promote-to-dependent is sticky per scope:**
    
    -   Once a scope has ever seen `depth(C)>0`, mark that `(scope, C)` pair as “sticky dependent”.
        
    -   All future evaluations in that scope target the dependent clone (`C3`), even if a particular evaluation’s deps happen to be purely unscoped.
        
-   You can still allow global bi-stability across *different scopes* (e.g., S0 uses C0, S3 uses C3), but *within* a given scope, classification doesn’t oscillate back to unscoped once it’s been dependent.
    

Pros:

-   Prevents “late flip back” from dependent to unscoped which is the most confusing in the presence of React rerenders and async.
    
-   Keeps the model simpler when you reason about a scope: “If this scope has ever used a scoped dependency through C, that scope now effectively owns a Cᵏ variant.”
    

Cons:

-   Slightly less “pure”: even if a branch stops touching scoped deps, that scope still has a separate Cᵏ.
    

But given how subtle async + scopes can be, sticky-when-promoted is a very reasonable tradeoff between your desire for “intuitive” per-eval classification and the need to avoid inscrutable runtime behavior.

---

### Summary of where this leaves us

Using your notes 14–17 and folding in the latest adjustments:

-   We **do** keep using copies of atoms (clones) for any scoped variant (explicit, implicit, and now dependent scoped), with the store’s `atomStateMap` keyed by those clones. [Daishi Kato's Read the Code](https://newsletter.daishikato.com/p/learn-how-jotai-uses-a-symbol-for-internal-api)
    
-   We treat each `readAtomState` as a **tiny transaction**:
    
    -   Collect deps → classify (unscoped vs scoped vs dependent).
        
    -   Commit to the correct clone’s `atomState` (C0 vs C1 vs C3) *before* `recomputeDependents`.
        
-   For dependent scoped atoms:
    
    -   We lazily create clones (e.g. `C3`) when we first discover scope-influenced dependencies in a given scope.
        
    -   We hot-swap the **internal identity** used in that scope (so ScopeProvider’s `useAtom` resolves `C` to `C3` for S3).
        
-   We mitigate late async classification issues by:
    
    -   Ensuring classification/commit happens before notifications.
        
    -   Making “promotion to dependent scoped in this scope” **sticky** for that `(scope, atom)` pair.
        

And we can express all of that in your topography language, e.g.:

```txt
S0[ ]:  A0, B0, C0(A0 + B0)
S1[B]:  A0, B1, C1(A0 + B1)      // implicit/explicit scoped C1 using B1
S2[ ]:  A0, B1, C1(A0 + B1)      // inherits C1
S3[A]:  A3, B1, C3(A3 + B1)      // dependent scoped clone; sticky in S3
```

If you want, next step we can pick one concrete topography (like the S1/S2/S3 example) and sketch the exact sequence of `readAtomState` / clone creation / classification in code terms so you can sanity-check it against the actual jotai-scope internals.

You: 

Oops, I meant D0(C0).

ChatGPT: 

Thought for 14s

Gotcha, that makes way more sense 👍

Let’s restate the topography with the fix:

```txt
S0[ ]:  A0, B0, C0(A0 + B0), D0(C0)
S1[C]:  A0, B0, C1(A1 + B1), D1(C1)
S2[ ]:  A0, B0, C1(A1 + B1), D1(C1)
S3[A]:  A3, B0, C3(A3 + B1), D3(C3)
```

Key changes vs the previous version:

-   In **S0**:
    
    -   `D0(C0)` now depends on the *global* `C0`, not some magically “C1 from the future scope”.
        
    -   So `D0` is purely depth-0 in S0. No weird cross-scope dependency.
        
-   In **S1\[C\]**:
    
    -   We introduce `C1(A1 + B1)` (explicit/implicit scoped C at depth 1).
        
    -   `D1(C1)` is the first time D becomes scope-influenced: in S1, `D` is now a depth-1 dependent scoped atom.
        
    -   In terms of clones: `C1`, `D1` are new atom identities; `A1` / `B1` are whatever scoped/implicit/dependent story we end up with for that level.
        
-   In **S2\[ \]**:
    
    -   No new explicits; it just **inherits** `C1`, `D1` from S1.
        
    -   Reads of `C`/`D` in S2 resolve to `C1` / `D1`.
        
-   In **S3\[A\]**:
    
    -   `A` is explicit → `A3`.
        
    -   `C3(A3 + B1)` becomes a new depth-3 dependent/implicit clone of `C`.
        
    -   `D3(C3)` becomes a depth-3 dependent clone of `D`, tied to `C3`.
        

So with the corrected `D0(C0)`:

-   There’s **no** depth-1 influence on `D` at S0 anymore.
    
-   All promotion of `D` to “dependent scoped” happens *per scope* where it actually sees scoped inputs:
    
    -   `D1` in S1/S2 (through `C1`),
        
    -   `D3` in S3 (through `C3`).
        

The algorithm we were sketching (classify per read, create dependent clone like `D1`/`D3` for that depth, and then make that clone sticky per scope) still works exactly the same — we just don’t have that weird case where `D0` was “born” depth-1 in the root scope.

If you want, next we can:

-   Step through this exact topography and show:
    
    -   which clones get created when,
        
    -   what `depth(C)` / `depth(D)` we compute in each scope, and
        
    -   how `useAtom(D)` resolves in S0/S1/S2/S3 under the “lazy dependent clone + sticky promotion” plan.

You: 

18\. But what if an atom asynchronously gets an explicit scoped atom. Since jotai transactions are synchronous, React has already rerendered BEFORE the scoped classification. What rules / process / limitations / restrictions can we enstate to best mitigate this? What do you recommend? 19. But even if we go with sticky classification, we don’t fully escape the problem described in 18. The first read is still ambiguous. Should we just recommend to explicit scope async atoms that need to read explicit atoms? But then all unscoped atoms read would be implicit – which is not the same behavior. 20. How should we treat writing to dependent scoped atoms? Their value is derived, so for them to be writable they must provide a custom write function. Do we treat them any differently than unscoped writable atoms?

ChatGPT: 

Thought for 2m 21s

Nice, these are the really nasty edge cases 😅  
I’ll go one by one: 18, 19, 20, and I’ll be explicit about *rules / guarantees / recommendations*.

---

## 18\. Async reads that (eventually) touch explicit scoped atoms

> What if an atom **asynchronously** gets an explicit scoped atom? Since Jotai transactions are synchronous, React has already rerendered *before* the scoped classification. What rules / process / limitations / restrictions can we use to mitigate this?

First, it’s helpful to separate *kinds* of “async” use of `get`:

1.  **Async value, sync `get`** (this is the “normal” Jotai way):
    
    ```ts
    const asyncAtom = atom(async (get) => {
      const a = get(explicitA) // ← sync get
      const data = await fetch(`/api?val=${a}`)
      return data
    })
    ```
    
    -   `get(explicitA)` runs *synchronously* during `readAtomState(asyncAtom)`.
        
    -   The dependency (`explicitA`) is recorded **before** we return a promise.
        
    -   Our classification logic sees `explicitA` in the deps set → `asyncAtom` is dependent scoped *during that read*.
        
    -   React hasn’t re-rendered yet when we classify & commit.
        
    
    ✅ This case is **safe** with the design we’ve been sketching.
    
2.  **Late `get` after `await` / in a callback** inside the read:
    
    ```ts
    const weirdAtom = atom(async (get) => {
      const x = await get(someAsyncAtom) // or await somethingElse
      // later:
      const a = get(explicitA)           // ← “late” get
      return x + a
    })
    ```
    
    or:
    
    ```ts
    const weirdAtom = atom(async (get) => {
      const x = await something()
      // schedule later
      setTimeout(() => {
        const a = get(explicitA)         // ← called long after original read
        ...
      })
      ...
    })
    ```
    
    In *actual* Jotai internals, the dependency graph is built from the `get` calls that happen **during the synchronous part of the read**. Once the read has returned (a value or a promise), any subsequent `get` calls (after the first `await`, or inside `setTimeout`) **do not participate** in dependency tracking. They’re just side-effect reads.
    
    -   Jotai can’t retroactively say, “Oh, this atom actually depends on `explicitA`; let’s go back and reclassify it and rewire dependents.”
        
    -   React has already been scheduled for whatever value/promise we returned on the first pass.
        

So there’s a fundamental tension:

-   **Correctness of what value you see** when you call `get(explicitA)` asynchronously → we *can* still guarantee that, by making the `get` implementation scope-aware at all times.
    
-   **Classification / caching / change-propagation** based on those asynchronous `get`s → Jotai’s current model simply doesn’t see those as dependencies.
    

Given that, my recommendation is:

### Recommended rules for async + scopes

1.  **Classification is based only on sync `get`s inside the read.**  
    That is: whether an atom is treated as unscoped vs dependent scoped is decided from the `get` calls that happen:
    
    -   before the first `await` in the read, and
        
    -   within the synchronous transaction that `readAtomState` runs.
        
2.  **Asynchronous `get`s must not be relied on to change classification.**  
    You should assume they will:
    
    -   read the correct *value* for the current scope (our `get` wrapper always routes to the right explicit/dependent clone), but
        
    -   **not** cause the atom to be reclassified or re-keyed.
        
3.  **To get “correct” scoped semantics for an async atom, make the scoped deps visible *synchronously* at the top of the read.**  
    For example:
    
    ```ts
    const asyncAtom = atom(async (get) => {
      // force classification to see explicitA as a dep:
      const _ = get(explicitA)   // we might not use this yet, but it tags us as dependent
    
      const data = await somethingAsync()
      const a = get(explicitA)   // later read – value is correct but doesn't affect deps
      return data + a
    })
    ```
    
4.  **Alternatively: don’t do late `get`s inside the read at all.**  
    Instead, split logic:
    
    -   Have one atom that performs the async business logic **based on sync deps**.
        
    -   Have side-effectful callbacks or React effects outside the atom that do follow-on async reads if needed.
        
5.  **Dev-mode warning (nice-to-have):**  
    In jotai-scope’s dev build, you could wrap `get` so that if it’s invoked:
    
    -   outside a known `readAtomState` transaction, and
        
    -   with an atom that’s explicit in some scope,  
        you log a warning: “This atom is reading an explicit scoped atom asynchronously; scoping classification, caching, and reactivity may not behave as you expect. Touch the explicit atom synchronously at the top of the read.”
        

In other words: we can **still guarantee value correctness** for async reads (always reading the right scoped variant), but we explicitly *don’t* try to let late async gets rewire the dependency graph after React has already rendered.

---

## 19\. Sticky classification doesn’t fix the *first* ambiguous read

> Even with sticky classification, the first read is ambiguous. Should we just recommend explicitly scoping async atoms that need to read explicit atoms? But then all unscoped atoms read would be implicit – which is not the same behavior.

Right, sticky only helps after we’ve *once* seen a sync scoped dep. It doesn’t fix the case where:

-   First few reads of `asyncAtom` don’t touch any explicit atom synchronously → we classify it as unscoped (C0).
    
-   A later async branch reads `explicitA` after an `await` → we’d *like* to treat it as dependent, but the classification mechanism never saw that dependency.
    

So, concretely:

-   **Sticky** solves the “flip-flopping back to unscoped” problem.
    
-   It does **not** solve “we never saw a scoped dep synchronously in the first place”.
    

Given Jotai’s model, there are only three realistic lines you can draw here:

### Option 1 – Strict rule, rely on sync-only deps

**Specification-level rule:**

> For jotai-scope, “dependent scoped” classification is defined only by sync `get` calls in the read function. If a read never touches explicit atoms synchronously, the atom is unscoped, even if some async branch later reads explicit atoms.

Then the guidance:

-   If you *care* about scoping semantics for an async atom that might read explicit atoms:
    
    -   Make sure you touch those explicit atoms synchronously at the top, or
        
    -   Treat that atom as **explicit** in the relevant scopes.
        

This is the cleanest semantics story, but you’re right: making an atom explicit changes unscoped behavior:

-   When you explicitly scope a derived atom, all atoms it reads during evaluation are implicitly scoped in that scope.
    
-   That’s stricter than the “dependent only when actually needed” semantics.
    

Still, for atoms that do complicated async interactions with scoped state, it’s arguably safer to say: *“Look, this atom is effectively tied to this scope; you should explicitly scope it.”*

### Option 2 – “Declaring” async scoped dependence

If you really don’t like over-scoping everything, you can introduce a convention or utility that lets the user “declare” that an atom *may* rely on scoped atoms asynchronously, so it should be treated as dependent from the outset:

For example:

```ts
const baseAtom = atom(async (get) => {
  const data = await something()
  const a = get(explicitA) // maybe or maybe not, depending on condition
  return data + a
})

// helper that marks this atom as “as if it always depends on explicitA”
const asyncScopeSensitiveAtom = markDependentOn(baseAtom, [explicitA])
```

Under the hood, `markDependentOn` could:

-   In dev: assert that, in any scope where `explicitA` is explicit, we always classify `baseAtom` as dependent scoped, *even before we see a sync `get`*.
    
-   In prod: either do the same, or simply treat it as explicit in that scope.
    

This keeps behavior closer to what you want:

-   Unscoped deps still behave normally.
    
-   But if it’s ever used in a scope where `explicitA` is explicit, we preemptively treat it as dependent scoped, avoiding the ambiguous “first async read”.
    

Downside: this is a new concept / API, and users must opt in.

### Option 3 – Hard recommendation

If you want to keep the implementation simple and avoid extra APIs, my honest recommendation is:

> **If an async atom’s logic really depends on scoped atoms in a way that matters, strongly recommend making it explicit (or factoring the scoped bit into an explicit atom).**

For example, split:

```ts
const scopedInputs = atom((get) => {
  const a = get(explicitA)
  const b = get(unscopedB)
  return { a, b }
})

const asyncAtom = atom(async (get) => {
  const { a, b } = get(scopedInputs) // scopedInputs explicit in this scope
  const data = await fetchStuff(a, b)
  return data
})
```

Now:

-   `scopedInputs` is explicit in a scope, and its behavior is well-defined.
    
-   `asyncAtom` is just an async atom that depends on `scopedInputs`, and gets the right scope semantics via normal dependency propagation.
    
-   Unscoped primitives you read inside `scopedInputs` remain unscoped unless you explicitly scope them somewhere.
    

So my “short” answer for 19:

-   Sticky classification fixes oscillation, not the ambiguous first read.
    
-   For the ambiguous first read, the **clean rule** is: dependent classification is sync-only; if you need scoped semantics in async branches, structure the read to touch scoped atoms synchronously, or factor that logic into an explicitly-scoped helper atom.
    

---

## 20\. Writes to dependent scoped atoms (derived with custom `write`)

> How should we treat writing to dependent scoped atoms? Their value is derived, so to be writable they must provide a custom `write` function. Do we treat them differently than unscoped writable atoms?

Conceptually: **no**. A dependent scoped atom is “just” another atom identity from Jotai’s point of view:

-   `C0` — global / unscoped.
    
-   `C1` — explicit or implicit scoped clone.
    
-   `C3` — dependent scoped clone in S3.
    

Each has the same `{ read, write }` implementation, but:

-   The `get` they see is scope-aware.
    
-   The `set` they see is scope-aware.
    

So for a writable derived atom, say:

```ts
const countAtom = atom(0)

const doubleAtom = atom(
  (get) => get(countAtom) * 2,
  (get, set, newDouble) => {
    const old = get(countAtom)
    set(countAtom, newDouble / 2)
  }
)
```

### At runtime:

-   In S0, `useAtom(doubleAtom)` resolves to `double0` (C0 clone), with `get`/`set` that:
    
    -   `get(countAtom)` → resolves to the S0-visible count (probably the global count).
        
    -   `set(countAtom, x)` → writes to the S0-visible count.
        
-   In S3, with `countAtom` explicit or scoped somewhere up the tree:
    
    -   `useAtom(doubleAtom)` resolves to `double3` (dependent scoped clone).
        
    -   Its `get`/`set` use the **same logic**, but:
        
        -   `get(countAtom)` resolves to the scoped `count` appropriate for S3.
            
        -   `set(countAtom, x)` writes to that scoped `count`.
            

We don’t need a separate “value cell” for `double3`; Jotai still caches its computed value in `atomState(double3)` just like any derived. When you call `set(double3, newDouble)`:

-   The `write` function runs with scope-aware `get`/`set`.
    
-   It writes to `countAtom` (which might be explicit or unscoped), and then:
    
    -   Jotai’s internals mark `countAtom` as changed,
        
    -   `recomputeDependents` re-runs `double3`, `double0`, etc. as appropriate.
        

So semantically:

-   **Writes to dependent scoped atoms behave exactly like writes to unscoped derived atoms**, just with inputs and outputs resolved through scoping.
    
-   If `write` targets an unscoped primitive, that change naturally affects all scopes that inherit that primitive.
    
-   If `write` targets an explicitly scoped primitive in a specific scope, that change is isolated to that scoped instance.
    

The only implementation nuance is:

-   Our scope-aware `get`/`set` wrappers must be used for both **read** and **write** of a writable derived atom.
    
-   But we don’t need any special-case for “dependent vs unscoped” in the write path: it’s entirely driven by which clone (`double0` vs `double3`) the scope resolved.
    

---

### TL;DR

-   **18:**  
    We can’t let *late* async `get` calls rewire the dependency graph after React has rendered. Classification must be based on synchronous `get`s in the read. Async `get`s still see correct values, but they don’t affect classification. Recommendation: ensure any atom that cares about scoped deps in async code touches those deps synchronously at the start (or factor that logic into an explicitly-scoped helper atom).
    
-   **19:**  
    Sticky classification prevents oscillating between unscoped and dependent after first promotion, but doesn’t solve the initial ambiguity. The clean story is: “dependent-ness is sync-only.” If you need more, either:
    
    -   declare the atom as effectively scope-tied (explicit or via a helper), or
        
    -   introduce an opt-in mechanism that preemptively treats certain atoms as dependent when used in scopes with specific explicit atoms.
        
-   **20:**  
    Writable dependent scoped atoms behave like normal writable derived atoms. They don’t get any special treatment: same `{ read, write }`, but `get`/`set` are scope-aware. Writes propagate to the correct underlying atoms (scoped or unscoped) based purely on the scoping resolution of those targets.

You: 

21\. But async (late) classification changes will write a promise to the wrong atomState. So can we just revert the atomState value when we realize classification has changed? 22. I love the dev mode warning! How about a throw instead if a late get changes the atom’s classification? 23. How is flip-flopping a problem? I don’t think it is because dependent atoms are derived and cannot be written to. 24. I like the util to mark the atom as dependent.

ChatGPT: 

Thought for 46s

Nice, this is converging into something pretty crisp. Let’s go through 21–24 and tighten the rules.

---

## 21\. “Can we just revert the atomState value when we realize classification has changed (async)?”

Short answer: **we shouldn’t allow async to change classification at all**, so there’s nothing to revert.

If we ever let “late” async `get` change classification:

-   You’d have already:
    
    -   written a **promise** into the wrong atom (say `C0`),
        
    -   updated `dependents` for `C0`,
        
    -   marked `C0` as changed,
        
    -   possibly already recomputed more derived atoms based on that state.
        
-   “Reverting” then means:
    
    -   moving the promise and deps from `C0` → `C3`,
        
    -   cleaning up `C0`’s dependents and invalidation,
        
    -   fixing `changedAtoms` and anything that already reacted to the wrong one.
        

That’s extremely fragile, especially if other atoms (or effects) already responded to the first placement.

The clean rule is:

> **Classification is chosen at the end of the synchronous part of `readAtomState`. Async never changes classification.**

So the sequence is:

1.  Sync part runs, sync `get`s are collected.
    
2.  We compute “unscoped vs dependent vs explicit”.
    
3.  We create/choose the correct clone (`C0`, `C1`, `C3`) and commit the atomState **there**.
    
4.  The committed state is a promise if the read was async.
    

All subsequent “resolution” work (when that promise settles) is tied to that atom identity. Late `get`s can still read the right scoped values (because `get` is scope-aware), but they *don’t* affect where that promise lives or which clone owns it.

So: **no async-driven reclassification → no need to revert**. If someone writes code where only a late async `get` introduces a scoped dependency, we treat that as **user error** (see 22).

---

## 22\. Dev-mode warning vs throw for late `get` that would change classification

I’d do exactly what you’re suggesting:

-   **Dev mode:**
    
    -   We keep a per-evaluation context:
        
        -   `phase: "collectingDeps" | "afterClassify"`
            
        -   `syncDeps: Set<Atom>` (atoms seen synchronously)
            
    -   When `readAtomState` finishes the sync part, we compute classification and flip to `phase: "afterClassify"`.
        
    -   Any `get` after that which:
        
        -   reads an **explicit** atom in this scope that was **not** in `syncDeps`
            
        -   and we know that would have changed depth (i.e., it’s an explicit atom at this scope)
            
    -   → we **throw** with a message along the lines of:
        
        > “Late get of scoped atom X inside read of Y after dependency collection. Scoping/classification is sync-only; make sure you touch scoped atoms synchronously at the top of Y’s read or mark Y as dependent.”
        
-   **Prod mode:**
    
    -   Same classification rule (sync-only).
        
    -   Late `get` just reads the right value (scope-aware), but does not change deps or classification.
        
    -   No throw for perf; maybe optional flag if you want.
        

You can think of this like React’s “hooks must be called unconditionally at the top level” rule:  
**“Scoped atoms that matter to the semantics of this read must be touched during the sync phase.”**

---

## 23\. Is flip-flopping actually a problem if dependent atoms are derived-only?

> How is flip-flopping a problem? I don’t think it is because dependent atoms are derived and cannot be written to.

Given that constraint, flip-flop is **not a correctness problem**, just a complexity/perf consideration.

With derived-only dependents:

-   There’s no user “source of truth” stored in, say, `C3` that could diverge from `C0`.
    
-   The only impact of flipping `depth(C)` between 0 and k across evaluations is:
    
    -   which clone (`C0` or `Ck`) caches the computed value,
        
    -   which clone shows up in `changedAtoms` / `dependents` for that evaluation,
        
    -   which one components in that scope subscribe to on that render (since `useAtom(C)` will resolve differently as the scope mapping changes).
        

As long as you:

1.  **Commit each evaluation to exactly one clone** (using the transactional readAtomState we discussed).
    
2.  Always resolve `useAtom(C)` to the same clone you committed for that scope on that render.
    

…then flip-flopping per evaluation is allowed. React just subscribes to “whichever clone this scope currently considers correct”.

So we can relax:

-   Sticky promotion is **not required for correctness** if dependent atoms are always derived-only.
    
-   It’s a potential optimization / simplification:
    
    -   Sticky: fewer clone transitions and clearer mental model (“S3 owns C3 now”).
        
    -   Non-sticky: more faithful to your “bi-stable classification” idea, at the cost of a little more churn and some extra complexity in implementation.
        

Given your latest comment, I’d say:

> Let’s keep **full bi-stable classification** for dependent derived atoms. They can bounce between `C0` and `Ck` across evaluations; we just need the transaction layer to ensure we never partially write to both.

We can always revisit “sticky” later if you find a real perf or UX reason.

---

## 24\. A utility to mark an atom as “dependent”

You like the idea – cool; here’s how I’d shape it.

### API sketch

Something like:

```ts
function markDependent<A extends AnyAtom>(
  atom: A,
  deps: ReadonlyArray<AnyAtom>,
): A
```

Usage:

```ts
const rawAsyncAtom = atom(async (get) => {
  const data = await fetch('/api')
  const a = get(explicitA) // might be late or conditional
  return data + a
})

// Tell jotai-scope: “in any scope where any of these deps are explicit,
// treat this atom as dependent scoped even if the sync read didn't touch them.”
export const asyncScopeSensitiveAtom = markDependent(rawAsyncAtom, [explicitA])
```

### Semantics

Under the hood, jotai-scope keeps some metadata:

```ts
dependentHints.set(asyncScopeSensitiveAtom, [explicitA])
```

When we classify an evaluation of `asyncScopeSensitiveAtom` in a scope S:

1.  We do the **normal** sync-based dependency analysis.
    
2.  Then we look at the hint list:
    
    -   If any hinted atom is **explicit** in S (or in an ancestor scope you consider relevant), we **force** `depth(atom) > 0` for this scope.
        
    -   Even if the sync pass didn’t actually `get` that atom this time.
        

Effectively:

-   In scopes that touch any of the hinted atoms:
    
    -   the atom is treated as **dependent scoped by construction** (gets its own clone/state for that scope).
        
-   In scopes that do **not** scope any of the hinted atoms:
    
    -   it behaves exactly like an unmarked atom (normal classification).
        

This gives you a nice “escape hatch” for tricky async cases:

-   You don’t have to fully explicit-scope the async atom (and thereby implicitly scope all its deps).
    
-   You can say: *“This atom is semantically tied to A and B when they’re scoped; please treat it as dependent in any scope where A or B are explicit, even if the sync part doesn’t read them on a particular run.”*
    

It also plays nicely with the dev-time throw:

-   If an atom is **marked** as dependent on `explicitA`, and we see late async `get(explicitA)` in a scope where it’s explicit, we know this is a usage pattern the user intentionally opted into; we can skip throwing in that specific case if desired (or keep the throw if classification still wouldn’t change).
    

---

### Quick recap

-   **21:** Don’t try to reclassify on async. Classification happens once per evaluation after sync deps are known; the promise is written directly into the right clone’s state. Reverting is brittle and not worth it.
    
-   **22:** In dev mode, throw if a late `get` of an explicit atom would have changed classification. That enforces the rule “classification is sync-only and must see scoped deps early”.
    
-   **23:** With derived-only dependent atoms, flip-flopping between unscoped and dependent per evaluation is fine; it’s not a correctness issue, just an implementation detail. Transactional evaluation makes it manageable.
    
-   **24:** A `markDependent(atom, [deps...])` helper is a great opt-in tool for async/scope-sensitive atoms: it lets you say “treat this as dependent whenever any of these deps are explicit in this scope”, without fully explicit-scoping the atom itself.

You: 

Give me a numbered list of single sentence requirements for all requirements, decisions, and implementation details decided thus far. Just a numbered list. Each item is just a single sentence. Example: 1. dependent scoped atoms are atoms that depend on dependent or explicit scoped atoms. 2. dependent scoped atoms are cloned per their scope level. 3. The influence depth is the level of the dependent scoped atom’s nearest explicit dependency. …

ChatGPT: 

1.  All scoped state must live inside the nearest ancestor Jotai Provider store (or the global default store), never in separate stores per scope.
    
2.  Scoped behavior is implemented by cloning atom objects so that each scoped variant uses a distinct atom identity as the key into the shared store.
    
3.  Scopes are modeled as levels `S0, S1, S2, ...` with notation `Sx[explicitAtoms]: Aₖ, Bₖ, Cₖ(...)` describing which atoms are explicit and at what depth their evaluations run.
    
4.  The “influence depth” of a derived atom is the maximum scope level of any explicit scoped atom in its transitive dependency graph for that evaluation.
    
5.  Atoms are classified into explicit scoped atoms, implicit scoped atoms, inherited/unscoped atoms, and dependent scoped derived atoms.
    
6.  Dependent scoped atoms are derived atoms whose transitive dependencies include at least one explicit scoped atom in the current scope hierarchy.
    
7.  Dependent scoped atoms must be cloned per influence depth (scope level) so each depth-specific variant has its own atom identity.
    
8.  Inherited/unscoped atoms are atoms that are not explicitly scoped at any level relevant to the current evaluation and therefore use the global (depth 0) atom identity.
    
9.  Explicit scoped atoms are those listed in a ScopeProvider’s `atoms`/`atomFamilies` props and must always get a cloned atom identity for that scope level.
    
10.  Implicit scoped atoms are cloned atom identities created when an explicit scoped atom’s read function synchronously touches additional atoms during evaluation.
    
11.  Dependent scoped atoms must not create new implicit scoped primitives; they simply read whichever explicit or unscoped primitives are visible at their scope level.
    
12.  Dependent scoped atoms cannot read implicit scoped atoms, whereas explicit and implicit scoped atoms may share and read implicit scoped atoms.
    
13.  For classification and scoping decisions, only synchronous `get` calls within the read function’s main (pre-`await`) execution are considered dependencies.
    
14.  Late asynchronous `get` calls (after the synchronous phase) must not influence dependency tracking or classification but must still return the correct scoped value.
    
15.  Each `readAtomState` invocation must be treated as a per-atom transaction that buffers writes to atomState, mounts, invalidated sets, and changed sets.
    
16.  At the end of the synchronous part of `readAtomState`, the transaction must compute the atom’s classification (unscoped, explicit, implicit, or dependent scoped) based on the collected deps.
    
17.  After classification, the transaction must commit all buffered changes into exactly one target atom identity (e.g. C₀, C₁, C₃), and never partially into multiple identities.
    
18.  The commit for a `readAtomState` transaction must happen before Jotai’s `recomputeDependents` logic runs so dependents see the correct target atom identity and state.
    
19.  Async atoms must write their pending promise and eventual resolved or rejected value into the classified target atom identity chosen at the end of the synchronous phase.
    
20.  Classification must never be changed by asynchronous `get` calls, and we must not attempt to reclassify or migrate promises after they have been committed.
    
21.  In development mode, calling `get` on an explicit scoped atom after classification in a way that would have changed the atom’s depth must throw an error.
    
22.  In production mode, late `get` on explicit scoped atoms must still read the correct scoped value but must silently have no effect on classification.
    
23.  Bi-stable classification is allowed: a dependent derived atom may evaluate as unscoped in one evaluation and dependent scoped in another, based purely on its synchronous dependencies.
    
24.  Dependent scoped atoms are treated as derived-only and must not be directly writable by user code.
    
25.  Writable derived atoms (with custom write functions) are treated like any other explicit or unscoped derived atom, with their `get` and `set` calls resolved through scope-aware mapping.
    
26.  Scope-aware `get` must always resolve each dependency atom to the correct clone for the current scope (explicit clone at that level if available, otherwise inherited clone).
    
27.  Scope-aware `set` must write to the correct underlying atom identity (scoped or unscoped) according to the same resolution rules used for `get`.
    
28.  Dependent scoped clones for a given atom and scope level must be created lazily on the first evaluation where classification determines a nonzero influence depth at that level.
    
29.  Once a dependent scoped clone exists for a given atom and scope level, that scope must resolve `useAtom` for that atom to the clone identity for any evaluation that classifies as dependent at that level.
    
30.  For async atoms that semantically depend on scoped atoms, users are encouraged either to synchronously touch the scoped atoms at the top of the read or to factor that logic into an explicitly scoped helper atom.
    
31.  A utility like `markDependent(atom, [deps...])` may be provided to predeclare that an atom should be treated as dependent scoped in any scope where any of the listed deps are explicit, even if the sync read doesn’t touch them.