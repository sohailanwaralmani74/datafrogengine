---
layout: default
title: "Sitemap - Complete Directory of DataFrog Tools | DataFrog"
description: "Sitemap for DataFrog. Browse all client-side tools, category indexes, data engineering guides, & online documentation pages on our platform today."
permalink: /sitemap
keywords: "DataFrog sitemap, site directory, all tools list"
---

<div class="page-container" style="max-width: 900px; margin: 0 auto; padding: 2.5rem 1.5rem; line-height: 1.7; color: var(--text-primary);">
  <header style="margin-bottom: 2.5rem; border-bottom: 1px solid var(--border-default); padding-bottom: 1.5rem;">
    <h1 style="font-size: 2.25rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-primary);">Site Directory &amp; Sitemap</h1>
    <p style="color: var(--text-muted); font-size: 1rem;">Complete index of DataFrog pages and categories.</p>
  </header>

  <section style="margin-bottom: 2.5rem;">
    <h2 style="font-size: 1.4rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Core Categories</h2>
    <ul style="line-height: 2; padding-left: 1.25rem;">
      <li><a href="/" style="color: var(--primary);">Home Page</a></li>
      <li><a href="/inspect/" style="color: var(--primary);">🔍 Inspect Category</a></li>
      <li><a href="/analyze/" style="color: var(--primary);">📊 Analyze Category</a></li>
      <li><a href="/validate/" style="color: var(--primary);">✅ Validate Category</a></li>
      <li><a href="/compare/" style="color: var(--primary);">⚖️ Compare Category</a></li>
      <li><a href="/visualize/" style="color: var(--primary);">📈 Visualize Category</a></li>
    </ul>
  </section>

  <section style="margin-bottom: 2.5rem;">
    <h2 style="font-size: 1.4rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Company &amp; Resources</h2>
    <ul style="line-height: 2; padding-left: 1.25rem;">
      <li><a href="/about-us" style="color: var(--primary);">About Us</a></li>
      <li><a href="/contact-us" style="color: var(--primary);">Contact Us</a></li>
      <li><a href="/blog/" style="color: var(--primary);">Blog</a></li>
      <li><a href="/privacy-policy" style="color: var(--primary);">Privacy Policy</a></li>
      <li><a href="/terms-of-service" style="color: var(--primary);">Terms of Service</a></li>
      <li><a href="/disclaimer" style="color: var(--primary);">Disclaimer</a></li>
    </ul>
  </section>

  <section style="margin-bottom: 2rem;">
    <h2 style="font-size: 1.4rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Catalog of Tools</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
      {% for tool in site.data.tools %}
        <div style="background: var(--bg-soft); padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-default);">
          <a href="{{ tool.url }}" style="color: var(--text-primary); text-decoration: none; font-weight: 500;">
            {{ tool.icon | default: "⚡" }} {{ tool.title }}
          </a>
          <span style="display: block; font-size: 0.75rem; color: var(--text-muted);">{{ tool.category }}</span>
        </div>
      {% else %}
        <p style="color: var(--text-muted); font-style: italic;">All tools registered in <code>_data/tools.yml</code> will dynamically populate in this catalog.</p>
      {% endfor %}
    </div>
  </section>
</div>
