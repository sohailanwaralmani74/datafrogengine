import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { Liquid } from 'liquidjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildSite() {
  const rootDir = __dirname;
  const siteDir = path.join(rootDir, '_site');

  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
  }

  // 1. Read _config.yml
  let config = {};
  const configPath = path.join(rootDir, '_config.yml');
  if (fs.existsSync(configPath)) {
    try {
      config = yamlLoad(fs.readFileSync(configPath, 'utf8')) || {};
    } catch (e) {
      console.warn('Error reading _config.yml:', e.message);
    }
  }

  // 2. Initialize Liquid
  const engine = new Liquid({
    root: [path.join(rootDir, '_layouts'), path.join(rootDir, '_includes'), rootDir],
    extname: '.html'
  });

  // Custom filters matching Jekyll defaults
  engine.registerFilter('relative_url', (input) => {
    const base = config.baseurl || '';
    if (!input) return base || '/';
    return (base + (input.startsWith('/') ? input : '/' + input)).replace(/\/+/g, '/');
  });

  // 3. Render index.html
  const indexPath = path.join(rootDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const rawContent = fs.readFileSync(indexPath, 'utf8');

    let frontMatter = {};
    let contentBody = rawContent;

    // Parse Front Matter if present
    const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      try {
        frontMatter = yamlLoad(fmMatch[1]) || {};
        contentBody = fmMatch[2];
      } catch (e) {
        console.warn('Front matter parsing failed:', e);
      }
    }

    const context = {
      site: config,
      page: { ...frontMatter }
    };

    // Render inner content
    const renderedInner = engine.parseAndRenderSync(contentBody, context);

    // Render within layout if specified
    let finalHtml = renderedInner;
    const layoutName = frontMatter.layout;
    if (layoutName) {
      const layoutPath = path.join(rootDir, '_layouts', `${layoutName}.html`);
      if (fs.existsSync(layoutPath)) {
        const layoutTpl = fs.readFileSync(layoutPath, 'utf8');
        finalHtml = engine.parseAndRenderSync(layoutTpl, {
          ...context,
          content: renderedInner
        });
      }
    }

    fs.writeFileSync(path.join(siteDir, 'index.html'), finalHtml, 'utf8');
  }

  // 4. Copy assets & asset directories
  for (const assetFolder of ['assets', 'asset']) {
    const assetsSrc = path.join(rootDir, assetFolder);
    const assetsDest = path.join(siteDir, assetFolder);
    if (fs.existsSync(assetsSrc)) {
      copyRecursiveSync(assetsSrc, assetsDest);
    }
  }

  // 5. Also sync to dist/ for static hosts
  const distDir = path.join(rootDir, 'dist');
  copyRecursiveSync(siteDir, distDir);

  console.log('Jekyll site generated in _site/ and dist/');
  return siteDir;
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSite();
}
