import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectCatalog } from './rules.mjs';

const here = new URL('./', import.meta.url);
const bytes = await readFile(new URL('catalog.json', here));
const catalog = JSON.parse(bytes);
const results = inspectCatalog(catalog);
const manifest = JSON.parse(await readFile(new URL('edition-manifest.json', here), 'utf8'));
if (!/^editions\/[A-Za-z0-9.-]+\.json$/.test(manifest.path)) throw new Error('Invalid edition path');
const edition = await readFile(new URL(manifest.path, here));
const hash = createHash('sha256').update(bytes).digest('hex');
if (manifest.catalog_version !== catalog.catalog_version || manifest.sha256 !== hash || !bytes.equals(edition)) {
  throw new Error('Catalog edition, manifest, or immutable snapshot mismatch');
}
console.log(JSON.stringify({catalog_version: catalog.catalog_version, catalog_sha256: hash, checks: results}, null, 2));
if (results.some(result => result.status === 'unmet')) process.exitCode = 1;
