import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const overridesRelative = 'tools/school-official-url-overrides.json';
const manifestRelative = 'content/schools.json';
const overridesData = readJson(overridesRelative);
const overrideEntries = overridesData.institutions || {};
const overrideUrls = Object.fromEntries(Object.entries(overrideEntries).map(([id, item]) => [id, item.officialUrl]));
const manifest = readJson(manifestRelative);
if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('School manifest does not list shard files.');

const seenIds = new Set();
const missingIds = new Set();
const conflictingListings = [];
let listingCount = 0;
let institutionReferenceCount = 0;
const shards = manifest.files.map(file => {
  const relative = `content/${file}`;
  const shard = readJson(relative);
  for (const campus of shard.campuses || []) {
    for (const listing of campus.listings || []) {
      listingCount += 1;
      const ids = listing.institutionIds || [];
      institutionReferenceCount += ids.length;
      const urls = [];
      for (const id of ids) {
        seenIds.add(id);
        if (!overrideUrls[id]) missingIds.add(id);
        else urls.push(overrideUrls[id]);
      }
      const uniqueUrls = [...new Set(urls)];
      if (uniqueUrls.length > 1) conflictingListings.push({ campus: campus.name, listing: listing.name, ids, urls: uniqueUrls });
      listing.officialUrl = uniqueUrls[0] || null;
    }
    campus.officialUrl = (campus.listings || []).find(listing => listing.officialUrl)?.officialUrl || null;
  }
  return { file, relative, shard };
});

const unusedIds = Object.keys(overrideUrls).filter(id => !seenIds.has(id));
if (missingIds.size || unusedIds.length || conflictingListings.length) {
  throw new Error(JSON.stringify({ missingIds: [...missingIds], unusedIds, conflictingListings }, null, 2));
}
if (institutionReferenceCount !== overridesData.meta.institutionReferenceCount) {
  throw new Error(`Institution reference count mismatch: ${institutionReferenceCount}/${overridesData.meta.institutionReferenceCount}`);
}

const uniqueUrlCount = new Set(Object.values(overrideUrls)).size;
manifest.meta.officialUrlSource = overridesRelative;
manifest.meta.officialUrlReferenceCount = institutionReferenceCount;
manifest.meta.officialUrlListingCount = listingCount;
manifest.meta.officialUrlMissingCount = 0;
manifest.meta.officialUrlUniqueCount = uniqueUrlCount;

if (write) {
  for (const { relative, shard } of shards) fs.writeFileSync(path.join(root, relative), `${JSON.stringify(shard)}\n`, 'utf8');
  fs.writeFileSync(path.join(root, manifestRelative), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  mode: write ? 'write' : 'check',
  shardFiles: manifest.files,
  campusCount: shards.reduce((sum, item) => sum + (item.shard.campuses || []).length, 0),
  listingCount,
  institutionReferenceCount,
  uniqueUrlCount,
  missingIds: [...missingIds],
  unusedIds,
  conflictingListings
}, null, 2));
