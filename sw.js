// Scope cache ownership to this installation so a website's other apps are untouched.
const CACHE_PREFIX = `bc-design-shell:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v87`;
const APP_SHELL = ["./member-end-cuts.js?v=79", "./connector-details.js?v=78", "./pdf-jspdf.js?v=77", "./pdf-svg2pdf.js?v=77", "./pdf-fonts.js?v=77", "./vector-pdf.js?v=78", "./pdf-licenses.txt", "./", "./index.html", "./styles.css?v=87", "./foundation-details.js?v=69", "./floor-framing.js?v=70", "./floor-fittings.js?v=71", "./roofs.js?v=45", "./roof-junctions.js?v=45", "./roof-trimming.js?v=45", "./roof-framing.js?v=45", "./rooms.js?v=67", "./stairs.js?v=53", "./stair-coordination.js?v=49", "./stair-rails.js?v=55", "./deck-framing.js?v=22", "./services.js?v=45", "./service-connections.js?v=45", "./service-envelopes.js?v=45", "./material-references.js?v=54", "./service-clearance-checks.js?v=45", "./service-route-body-checks.js?v=45", "./service-route-volumes.js?v=45", "./plan-sheet.js?v=68", "./site-sheet.js?v=83", "./floor-openings.js?v=52", "./floor-cuts.js?v=52", "./stair-headroom.js?v=53", "./stair-rail-members.js?v=54", "./stair-rail-ends.js?v=55", "./deck-boards.js?v=56", "./deck-supports.js?v=57", "./deck-posts.js?v=60", "./deck-edges.js?v=60", "./deck-post-members.js?v=60", "./foundation-setout.js?v=69", "./kitchen.js?v=69", "./elevations.js?v=69", "./stock-planning.js?v=76", "./app.js?v=87", "./workspace-ui.js?v=87", "./rendered-drawings.js?v=87", "./domain-registry.js?v=1", "./wet-areas.js?v=1", "./energy-efficiency.js?v=1", "./assets/realistic-renders/queenslander-pool-exterior.png", "./assets/realistic-renders/pool-deck-coping-drainage.png", "./assets/realistic-renders/site-aerial-landscape.png", "./manifest.json", "./brand-logo.svg", "./brand-mark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;
  const navigation = event.request.mode === 'navigate' && [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname);
  const shellUrls = new Set(APP_SHELL.map(file => new URL(file, scope).href));
  if (!navigation && !shellUrls.has(url.href)) return;
  const key = navigation ? new URL('index.html', scope).href : event.request;
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => (await cache.match(key)) || fetch(event.request).then((response) => {
      if (response.ok && response.type !== 'opaque') {
        const copy = response.clone();
        event.waitUntil(cache.put(key, copy));
      }
      return response;
    })),
  );
});
