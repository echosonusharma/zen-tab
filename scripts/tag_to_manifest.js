import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import semver from 'semver';

const PATH_TO_MANIFEST = './app/manifest.json';

(async () => {
  try {
    const manifest = JSON.parse(readFileSync(PATH_TO_MANIFEST, { encoding: 'utf-8' }));
    const currentVersion = manifest.version;
    
    if (!currentVersion) {
      throw new Error('No version found in manifest.json');
    }

    // increment version (you can change 'patch' to 'minor' or 'major' as needed)
    const newVersion = semver.inc(currentVersion, 'patch');
    
    if (!newVersion) {
      throw new Error('Failed to increment version');
    }

    console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

    manifest.version = newVersion;
    const updatedManifest = JSON.stringify(manifest, null, 2);
    writeFileSync(PATH_TO_MANIFEST, updatedManifest, { encoding: 'utf-8' });

    // create git tag
    const tagName = `v${newVersion}`;
    execSync(`git add ${PATH_TO_MANIFEST}`);
    execSync(`git commit -m "release: bump version to ${newVersion}"`);
    execSync(`git tag ${tagName}`);
    execSync(`git push origin ${tagName}`);
    console.log('done!');
  } catch (err) {
    console.error('Error during version bump:', err.message);
    process.exit(1);
  }
})();