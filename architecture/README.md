# BC Design architecture

BC Design is intentionally a modular monolith. The browser, desktop wrapper and
Expo workspace all consume the same ordered source files, so the current
architecture keeps one deployable and one model/history/persistence boundary.

The domain ownership map lives in [`domain-manifest.json`](./domain-manifest.json).
The runtime facade is exposed as `globalThis.BC_DESIGN_DOMAINS` after the shell
has loaded. It is a compatibility seam for new code; existing classic-script
globals remain available so the current desktop, Expo and test harnesses do not
need a risky migration all at once.

## Adding a feature

1. Put new domain logic in the owning domain's file set.
2. Keep model records serialisable and versioned by the shell's normal import/
   normalisation path.
3. Add a narrow facade function when another domain needs the capability.
4. Run `node scripts/validate-architecture.mjs` before syncing desktop or Expo.

## When to extract a service

Do not extract a microservice for file size or naming alone. Revisit the decision
only when a bounded domain has an independent owner, deployment cadence, data
store, scaling profile or security/isolation requirement, and the cost of a
versioned network contract is justified by that evidence.
