import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { Liquid } from 'liquidjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildSite(options = {}) {
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

  // 1b. Load _data/ directory into site.data (standard Jekyll data files)
  config.data = {};
  const dataDir = path.join(rootDir, '_data');
  if (fs.existsSync(dataDir)) {
    const dataFiles = fs.readdirSync(dataDir);
    for (const dFile of dataFiles) {
      const ext = path.extname(dFile).toLowerCase();
      const baseName = path.basename(dFile, ext);
      if (ext === '.yml' || ext === '.yaml') {
        try {
          config.data[baseName] = yamlLoad(fs.readFileSync(path.join(dataDir, dFile), 'utf8')) || [];
        } catch (e) {
          console.warn(`Error reading _data/${dFile}:`, e.message);
        }
      } else if (ext === '.json') {
        try {
          config.data[baseName] = JSON.parse(fs.readFileSync(path.join(dataDir, dFile), 'utf8')) || [];
        } catch (e) {
          console.warn(`Error reading _data/${dFile}:`, e.message);
        }
      }
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

    const computedUrl = frontMatter.permalink || (pageUrl !== undefined ? pageUrl : (
      srcRelativePath === 'index.html' ? '/' : '/' + srcRelativePath.replace(/\.html$/, '').replace(/\/index$/, '')
    ));

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

        // If it's pdf.html, also make it available at /pdf and /pdf/index.html
        if (baseName === 'pdf') {
          renderHtmlFile(path.join('pages', pFile), 'pdf.html', '/pdf');
          renderHtmlFile(path.join('pages', pFile), path.join('pdf', 'index.html'), '/pdf');
        }
      }
    }
  }

  // 4b. Render pages in /pdf directory (e.g. /pdf/compress-pdf)
  const pdfDir = path.join(rootDir, 'pdf');
  if (fs.existsSync(pdfDir)) {
    const pdfFiles = fs.readdirSync(pdfDir);
    for (const pFile of pdfFiles) {
      if (pFile.endsWith('.html')) {
        const baseName = pFile.replace(/\.html$/, '');
        const cleanUrl = baseName === 'index' ? '/pdf' : `/pdf/${baseName}`;
        // Output /pdf/<name>.html
        renderHtmlFile(path.join('pdf', pFile), path.join('pdf', pFile), cleanUrl);
        // Output /pdf/<name>/index.html
        if (baseName !== 'index') {
          renderHtmlFile(path.join('pdf', pFile), path.join('pdf', baseName, 'index.html'), cleanUrl);
        }
      }
    }
  }

  // 5. Copy assets directory
  const assetsSrc = path.join(rootDir, 'assets');
  const assetsDest = path.join(siteDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
  }

  // 5b. Export /assets/data/tools.json for global client-side search
  if (config.data && config.data.tools) {
    const srcDataDir = path.join(rootDir, 'assets', 'data');
    if (!fs.existsSync(srcDataDir)) {
      fs.mkdirSync(srcDataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(srcDataDir, 'tools.json'),
      JSON.stringify(config.data.tools, null, 2),
      'utf8'
    );

    const clientDataDir = path.join(siteDir, 'assets', 'data');
    if (!fs.existsSync(clientDataDir)) {
      fs.mkdirSync(clientDataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(clientDataDir, 'tools.json'),
      JSON.stringify(config.data.tools, null, 2),
      'utf8'
    );
  }

  // 6. Also sync to dist/ for static hosts (skipped during fast on-demand dev reloads)
  if (options.syncDist !== false) {
    const distDir = path.join(rootDir, 'dist');
    fs.cpSync(siteDir, distDir, { recursive: true });
  }

  return siteDir;
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSite();
}
