---
layout: default
title: "Clean Tools - Data Deduplication & Standardization | DataFrog"
description: "Free browser-based data cleaning tools. Remove Excel duplicates, clean CSV records, normalize text, and remove repeats with 100% total local data privacy."
permalink: /clean/
is_category: true
category_name: "Clean"
---

<div class="category-page" style="max-width: 1240px; margin: 0 auto; padding: 2.5rem 1.5rem;">
  
  <!-- Header -->
  <header style="margin-bottom: 2.5rem; text-align: center;">
    <span style="font-size: 3rem; display: block; margin-bottom: 0.5rem;">🧹</span>
    <h1 style="font-size: 2.25rem; font-weight: 800; color: #0f172a; margin-bottom: 0.5rem;">Clean Tools</h1>
    <p style="color: #475569; font-size: 1.1rem; max-width: 720px; margin: 0 auto 1.5rem; line-height: 1.6;">
      Data deduplication, text normalization, whitespace trimming, casing standardization, and spreadsheet cleaning tools — processed 100% locally in your browser.
    </p>

    <!-- Search within Category -->
    <div style="max-width: 540px; margin: 0 auto 1rem; position: relative;">
      <input type="text" id="category-search-input" placeholder="Search within Clean tools..." 
             style="width: 100%; padding: 0.85rem 1rem 0.85rem 2.75rem; font-size: 0.95rem; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff;">
      <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); opacity: 0.5;">🔍</span>
    </div>

    {% assign category_tools = site.data.tools | where: "category", "Clean" %}
    <div style="font-size: 0.9rem; font-weight: 600; color: #059669; background: #ecfdf5; display: inline-block; padding: 0.35rem 1rem; border-radius: 9999px;">
      Total Tools Available: <span id="tool-count-badge">{{ category_tools.size | default: 0 }}</span>
    </div>
  </header>

  <!-- Tools Grid -->
  <section style="margin-bottom: 3.5rem;">
    <div id="category-tools-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">
      {% for tool in category_tools %}
        <div class="category-tool-card" data-title="{{ tool.title | downcase }}" data-keywords="{{ tool.keywords | join: ' ' | downcase }}" data-desc="{{ tool.description | downcase }}"
             style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 1.75rem; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <span style="font-size: 1.75rem;">{{ tool.icon | default: "🧹" }}</span>
            <span style="font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem; background: #ecfdf5; color: #059669; border-radius: 9999px;">
              Clean
            </span>
          </div>
          <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; color: #0f172a;">
            <a href="{{ tool.url }}" style="color: inherit; text-decoration: none;">{{ tool.title }}</a>
          </h3>
          <p style="color: #64748b; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.25rem; flex-grow: 1;">
            {{ tool.description }}
          </p>
          <a href="{{ tool.url }}" style="padding: 0.6rem 1.25rem; background: #0f172a; color: #ffffff; border-radius: 8px; font-weight: 600; text-align: center; text-decoration: none; font-size: 0.9rem;">
            Open Tool →
          </a>
        </div>
      {% else %}
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <p style="color: #64748b; font-size: 1.05rem;">No tools currently registered under <strong>Clean</strong>. Tools added to <code>_data/tools.yml</code> with <code>category: Clean</code> will automatically display here.</p>
        </div>
      {% endfor %}
    </div>
  </section>

  <!-- Category FAQ -->
  <section style="max-width: 850px; margin: 0 auto;">
    <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; text-align: center;">Data Cleaning FAQ</h2>
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <details style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; cursor: pointer;">
        <summary style="font-weight: 600; color: #0f172a;">What are Data Cleaning Tools?</summary>
        <p style="margin-top: 0.5rem; color: #475569; font-size: 0.95rem;">Data cleaning tools remove duplicate records, trim whitespace, normalize text encodings, and sanitize spreadsheet datasets locally in your browser memory.</p>
      </details>
    </div>
  </section>

</div>

<script>
(function() {
  const searchInput = document.getElementById('category-search-input');
  const cards = document.querySelectorAll('.category-tool-card');
  if (!searchInput || !cards.length) return;

  searchInput.addEventListener('input', function(e) {
    const q = e.target.value.trim().toLowerCase();
    cards.forEach(card => {
      const title = card.dataset.title || '';
      const desc = card.dataset.desc || '';
      const kw = card.dataset.keywords || '';
      const show = !q || title.includes(q) || desc.includes(q) || kw.includes(q);
      card.style.display = show ? 'flex' : 'none';
    });
  });
})();
</script>
