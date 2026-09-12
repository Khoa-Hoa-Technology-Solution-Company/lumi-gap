const fs = require('fs');
const path = require('path');

const localesPath = path.join(process.cwd(), 'apps', 'web', 'src', 'i18n', 'locales');
const files = fs.readdirSync(localesPath).filter(f => f.endsWith('.ts') && f !== 'index.ts' && f !== 'gap-evidence-workflow.ts' && f !== 'en.ts');

for (const file of files) {
  let content = fs.readFileSync(path.join(localesPath, file), 'utf8');
  if (!content.includes('"Load More"')) {
    content = content.replace(/};\s*\n\s*import/g, '  "Load More": "Load More",\n  "Loading...": "Loading...",\n};\n\nimport');
    fs.writeFileSync(path.join(localesPath, file), content);
    console.log(`Updated ${file}`);
  }
}
console.log("Done.");
