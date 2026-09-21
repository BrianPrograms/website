import { readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
const rootFiles=['index.html','styles.css','app.js','robots.txt','sitemap.xml','site.webmanifest','favicon.ico','favicon-16x16.png','favicon-32x32.png','apple-touch-icon.png','android-chrome-192x192.png','android-chrome-512x512.png','assets/resume.pdf'];
export function publicAssets(root) {
  const files=[...rootFiles];
  function walk(relative,accept) {
    for(const entry of readdirSync(path.join(root,relative),{withFileTypes:true})) {
      const name=`${relative}/${entry.name}`;
      if(entry.isSymbolicLink())throw new Error('Public assets must not be symlinks');
      if(entry.isDirectory())walk(name,accept);else if(accept(name))files.push(name);
    }
  }
  for(const project of ['xorng','commander-draft'])walk(`projects/${project}`,file=>/\.(html|css|js)$/.test(file));
  files.push('projects/make-10/index.html','projects/make-10/styles.css','projects/make-10/app.js','projects/make-10/engine/expression.mjs','projects/make-10/engine/rational.mjs','projects/make-10/schedule/dates.mjs');
  walk('projects/make-10/ui',file=>file.endsWith('.mjs'));
  for(const file of files)if(!lstatSync(path.join(root,file)).isFile())throw new Error(`Missing public asset: ${file}`);
  return files.sort();
}
