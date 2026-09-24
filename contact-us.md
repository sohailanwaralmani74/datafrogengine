---
layout: default
title: "Contact Us - Get in Touch with DataFrog | DataFrog"
description: "Contact DataFrog. Send feedback, report issues, or suggest new browser-based data inspection, analysis, & validation tools directly to our team."
permalink: /contact-us
keywords: "Contact DataFrog, datafrog support, feature request, feedback"
---

<div class="page-container" style="max-width: 900px; margin: 0 auto; padding: 2.5rem 1.5rem; line-height: 1.7; color: var(--text-primary);">
  <header style="margin-bottom: 2.5rem; border-bottom: 1px solid var(--border-default); padding-bottom: 1.5rem;">
    <h1 style="font-size: 2.25rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-primary);">Contact Us</h1>
    <p style="color: var(--text-muted); font-size: 1.05rem;">We would love to hear from you! Have feedback, a bug report, or a tool request?</p>
  </header>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
    <div style="background: var(--bg-soft); padding: 2rem; border-radius: var(--radius-lg, 12px); border: 1px solid var(--border-default);">
      <h2 style="font-size: 1.3rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Direct Email</h2>
      <p style="margin-bottom: 0.5rem; color: var(--text-muted);">For general inquiries, partnership opportunities, or feedback:</p>
      <p style="font-size: 1.1rem; font-weight: 600; color: var(--primary);">contact@datafrog.tools</p>
      
      <p style="margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--text-muted);">For privacy concerns or legal notices:</p>
      <p style="font-size: 1.1rem; font-weight: 600; color: var(--primary);">privacy@datafrog.tools</p>
    </div>

    <div style="background: var(--bg-soft); padding: 2rem; border-radius: var(--radius-lg, 12px); border: 1px solid var(--border-default);">
      <h2 style="font-size: 1.3rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Response Time</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem;">We review all incoming inquiries and feature requests carefully. Our typical response timeframe is <strong>24 to 48 hours</strong> during business days.</p>
      <p style="color: var(--text-muted);">If requesting a new browser tool, please specify the input format, desired output or visualization, and any sample structures.</p>
    </div>
  </div>

  <section style="background: var(--bg-soft); padding: 2rem; border-radius: var(--radius-lg, 12px); border: 1px solid var(--border-default);">
    <h2 style="font-size: 1.4rem; font-weight: 600; margin-bottom: 1.5rem; color: var(--text-primary);">Send Us a Message</h2>
    
    <form onsubmit="event.preventDefault(); alert('Thank you for contacting DataFrog! Your message has been prepared for transmission.');" style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div>
        <label for="contact-name" style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-primary);">Your Name</label>
        <input type="text" id="contact-name" name="name" required placeholder="Jane Doe" style="width: 100%; padding: 0.75rem 1rem; border-radius: var(--radius-md, 8px); border: 1px solid var(--border-default); background: var(--bg-surface, #ffffff); color: var(--text-primary); font-size: 1rem;">
      </div>

      <div>
        <label for="contact-email" style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-primary);">Email Address</label>
        <input type="email" id="contact-email" name="email" required placeholder="jane@example.com" style="width: 100%; padding: 0.75rem 1rem; border-radius: var(--radius-md, 8px); border: 1px solid var(--border-default); background: var(--bg-surface, #ffffff); color: var(--text-primary); font-size: 1rem;">
      </div>

      <div>
        <label for="contact-subject" style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-primary);">Subject</label>
        <input type="text" id="contact-subject" name="subject" required placeholder="Feature request / Feedback" style="width: 100%; padding: 0.75rem 1rem; border-radius: var(--radius-md, 8px); border: 1px solid var(--border-default); background: var(--bg-surface, #ffffff); color: var(--text-primary); font-size: 1rem;">
      </div>

      <div>
        <label for="contact-message" style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-primary);">Message</label>
        <textarea id="contact-message" name="message" rows="5" required placeholder="Describe your request or feedback..." style="width: 100%; padding: 0.75rem 1rem; border-radius: var(--radius-md, 8px); border: 1px solid var(--border-default); background: var(--bg-surface, #ffffff); color: var(--text-primary); font-size: 1rem; resize: vertical;"></textarea>
      </div>

      <button type="submit" style="align-self: flex-start; padding: 0.85rem 2rem; background: var(--primary, #2563eb); color: #ffffff; border: none; border-radius: var(--radius-pill, 9999px); font-weight: 600; font-size: 1rem; cursor: pointer;">Send Message</button>
    </form>
  </section>
</div>
