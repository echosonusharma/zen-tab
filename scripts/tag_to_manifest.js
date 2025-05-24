import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const PATH_TO_MANIFEST = './app/manifest.json';

(async () => {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0').toString().trim();
    const version = lastTag.slice(1);

    let manifest = JSON.parse(readFileSync(PATH_TO_MANIFEST, { encoding: 'utf-8' }));
    manifest.version = version;
    manifest = JSON.stringify(manifest, null, 2)
    writeFileSync(PATH_TO_MANIFEST, manifest, { encoding: 'utf-8' })
  } catch (err) {
    console.error('Error getting last tag:', err.message);
  }
})()
