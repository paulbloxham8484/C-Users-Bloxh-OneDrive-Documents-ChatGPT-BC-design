/*
 * Stable in-process seams for the modular monolith.
 *
 * The implementation remains in the existing ordered classic scripts for now.
 * These lazy methods let new code depend on a domain contract without copying
 * implementation or introducing a second runtime/deployment boundary.
 */
(function registerBcDesignDomains(root) {
  const expose = (domain, name) => (...args) => {
    const implementation = root[name];
    if (typeof implementation !== "function") {
      throw new Error(`${domain} domain API is unavailable: ${name}`);
    }
    return implementation(...args);
  };
  const api = names => Object.freeze(Object.fromEntries(names.map(name => [name, expose("services", name)])));

  root.BC_DESIGN_DOMAINS = Object.freeze({
    version: 1,
    services: api([
      "makeService", "makeServiceItem", "serviceGeometry", "validateService", "normalizeServices",
      "normalizeServiceConnections", "normalizeServiceEnvelopes", "serviceQuantityRows",
      "serviceConnectionRows", "serviceClearanceChecks", "serviceRouteBodyChecks",
      "serviceVolumeGeometry", "serviceRouteVolumeBounds"
    ])
  });
})(globalThis);
