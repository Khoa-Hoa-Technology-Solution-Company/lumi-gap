const fs = require('fs');
const path = require('path');
const localesPath = path.join(process.cwd(), 'apps', 'web', 'src', 'i18n', 'locales');
const enContent = fs.readFileSync(path.join(localesPath, 'en.ts'), 'utf8');

const keysMatch = enContent.match(/"([^"]+)":/g) || [];
const enKeys = keysMatch.map(k => k.slice(1, -2));

console.log('EN keys length:', enKeys.length);

const files = fs.readdirSync(localesPath).filter(f => f.endsWith('.ts') && f !== 'en.ts');
files.forEach(file => {
  let content = fs.readFileSync(path.join(localesPath, file), 'utf8');
  let missing = 0;
  for (const key of ['Load More', 'Loading...']) {
    if (!content.includes('"' + key + '"') && !content.includes('\'' + key + '\'')) {
       content = content.replace(/};\s*$/, '  "' + key + '": "' + key + '",\n};\n');
       missing++;
    }
  }
  if (missing > 0) {
    fs.writeFileSync(path.join(localesPath, file), content);
    console.log('Updated', file, missing, 'keys');
  }
});
