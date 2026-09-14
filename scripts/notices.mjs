import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const queue = Object.keys(manifest.dependencies ?? {});
const seen = new Set();
const sections = ['# Third-party notices\n\nThese packages are bundled in FormatFlow. Electron and Chromium license files are distributed alongside the executable.\n'];
while (queue.length) {
  const name = queue.shift(); if (seen.has(name)) continue; seen.add(name);
  const directory = path.join(root, 'node_modules', name);
  let pkg;
  try { pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); } catch { continue; }
  queue.push(...Object.keys(pkg.dependencies ?? {}));
  const files = (await readdir(directory)).filter((f) => /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(f));
  const texts = [];
  for (const file of files) { try { texts.push(await readFile(path.join(directory, file), 'utf8')); } catch { /* skip directories */ } }
  sections.push(`## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license ?? 'See package'}\n\n${texts.join('\n\n')}\n`);
}
await writeFile('THIRD_PARTY_NOTICES.md', sections.join('\n---\n\n'));
console.log(`Collected notices for ${seen.size} packages.`);
