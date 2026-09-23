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

  // Helper to render any HTML file with front-matter and layout
  function renderHtmlFile(srcRelativePath, destRelativePath, pageUrl) {
    const fullSrcPath = path.join(rootDir, srcRelativePath);
    if (!fs.existsSync(fullSrcPath)) return;

    const rawContent = fs.readFileSync(fullSrcPath, 'utf8');
    let frontMatter = {};
    let contentBody = rawContent;

    const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      try {
        frontMatter = yamlLoad(fmMatch[1]) || {};
        contentBody = fmMatch[2];
      } catch (e) {
        console.warn(`Front matter parsing failed for ${srcRelativePath}:`, e);
      }
    }

    const computedUrl = pageUrl !== undefined ? pageUrl : (
      srcRelativePath === 'index.html' ? '/' : '/' + srcRelativePath.replace(/\.html$/, '').replace(/\/index$/, '')
    );

    const context = {
      site: config,
      page: {
        url: computedUrl,
        permalink: computedUrl,
        ...frontMatter
      }
    };

    const renderedInner = engine.parseAndRenderSync(contentBody, context);
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

    const fullDestPath = path.join(siteDir, destRelativePath);
    const destDir = path.dirname(fullDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.writeFileSync(fullDestPath, finalHtml, 'utf8');
  }

  // 3. Render index.html
  renderHtmlFile('index.html', 'index.html', '/');

  // 3b. Render 404.html
  if (fs.existsSync(path.join(rootDir, '404.html'))) {
    renderHtmlFile('404.html', '404.html', '/404');
  }

  // 4. Render pages in /pages directory with clean URLs (no .html, no trailing slash)
  const pagesDir = path.join(rootDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir);
    for (const pFile of pageFiles) {
      if (pFile.endsWith('.html')) {
        const baseName = pFile.replace(/\.html$/, '');
        const cleanUrl = `/pages/${baseName}`;
        // Output /pages/<name>.html
        renderHtmlFile(path.join('pages', pFile), path.join('pages', pFile), cleanUrl);
        // Also output /pages/<name>/index.html for static server directory fallback
        renderHtmlFile(path.join('pages', pFile), path.join('pages', baseName, 'index.html'), cleanUrl);
      }
    }
  }

  // 5. Copy assets directory
  const assetsSrc = path.join(rootDir, 'assets');
  const assetsDest = path.join(siteDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    copyRecursiveSync(assetsSrc, assetsDest);
  }

  // 6. Also sync to dist/ for static hosts
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
