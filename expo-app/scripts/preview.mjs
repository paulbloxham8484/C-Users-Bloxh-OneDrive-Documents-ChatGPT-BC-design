import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const expoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.BC_DESIGN_PREVIEW_ROOT=resolve(expoRoot,'dist');
process.env.PORT ||= '4180';
// Keep cwd outside dist so Windows can rebuild generated web output while previewing.
await import('../../serve.mjs');
