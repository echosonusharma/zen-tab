/**
 * Automates the version bumping and release process for the extension.
 * 
 * This script ensures that `app/manifest.json` and `package.json`
 * are kept perfectly in sync with the same version.
 * 
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import semver from 'semver';

const PATH_TO_MANIFEST = './app/manifest.json';
const PATH_TO_PACKAGE = './package.json';

(async () => {
  try {
    const manifest = JSON.parse(readFileSync(PATH_TO_MANIFEST, { encoding: 'utf-8' }));
    const currentVersion = manifest.version;

    if (!currentVersion) {
      throw new Error('No version found in manifest.json');
    }

    const bumpType = process.argv[2] || 'patch';
    let newVersion;

    if (['major', 'minor', 'patch', 'prerelease', 'premajor', 'preminor', 'prepatch'].includes(bumpType)) {
      newVersion = semver.inc(currentVersion, bumpType);
    } else if (semver.valid(bumpType)) {
      newVersion = bumpType;
    } else {
      throw new Error(`Invalid version bump type or explicit version: ${bumpType}`);
    }

    if (!newVersion) {
      throw new Error('Failed to determine new version');
    }

    console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

    // Update manifest.json
    manifest.version = newVersion;
    writeFileSync(PATH_TO_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf-8' });

    // Update package.json
    const pkg = JSON.parse(readFileSync(PATH_TO_PACKAGE, { encoding: 'utf-8' }));
    pkg.version = newVersion;
    writeFileSync(PATH_TO_PACKAGE, JSON.stringify(pkg, null, 2) + '\n', { encoding: 'utf-8' });

    // create git tag
    const tagName = `v${newVersion}`;
    execSync(`git add ${PATH_TO_MANIFEST} ${PATH_TO_PACKAGE}`);
    execSync(`git commit -m "release: bump version to ${newVersion}"`);
    execSync(`git push origin`);
    execSync(`git tag ${tagName}`);
    execSync(`git push origin ${tagName}`);
    console.log('done!');
  } catch (err) {
    console.error('Error during version bump:', err.message);
    process.exit(1);
  }
})();