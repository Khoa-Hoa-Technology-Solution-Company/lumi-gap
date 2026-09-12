import * as fs from 'fs';
import * as path from 'path';

const localesPath = path.join(process.cwd(), 'apps', 'web', 'src', 'i18n', 'locales');
const files = fs.readdirSync(localesPath).filter(f => f.endsWith('.ts'));

files.forEach(file => {
  const fp = path.join(localesPath, file);
  let content = fs.readFileSync(fp, 'utf8');
  
  const translations: Record<string, Record<string, string>> = {
    'en': { 'Load More': 'Load More', 'Loading...': 'Loading...' },
    'vi': { 'Load More': 'Tải thêm', 'Loading...': 'Đang tải...' },
    'es': { 'Load More': 'Cargar más', 'Loading...': 'Cargando...' },
    'fr': { 'Load More': 'Charger plus', 'Loading...': 'Chargement...' },
    'de': { 'Load More': 'Mehr laden', 'Loading...': 'Wird geladen...' },
    'pt': { 'Load More': 'Carregar mais', 'Loading...': 'Carregando...' },
    'zh': { 'Load More': '加载更多', 'Loading...': '加载中...' },
    'ja': { 'Load More': 'さらに読み込む', 'Loading...': '読み込み中...' },
    'ko': { 'Load More': '더 불러오기', 'Loading...': '로딩 중...' },
    'ru': { 'Load More': 'Загрузить еще', 'Loading...': 'Загрузка...' },
    'id': { 'Load More': 'Muat lebih banyak', 'Loading...': 'Memuat...' }
  };
  
  const lang = file.replace('.ts', '');
  const t = translations[lang] || translations['en'];
  
  // check if keys exist
  if (!content.includes("'Load More'")) {
    content = content.replace(/};\s*$/, `  "Load More": "${t['Load More']}",\n  "Loading...": "${t['Loading...']}",\n};\n`);
    fs.writeFileSync(fp, content);
    console.log(`Updated ${file}`);
  }
});
