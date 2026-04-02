# hugo-theme-enkr

My personal blog engine. A heavily customized fork of [Hugo Theme Stack](https://github.com/CaiJimmy/hugo-theme-stack) — rebuilt with inline commenting, real-time auth, floating navigation, and a design system I've been refining since 2023.

**Live at** [blog.enkr1.com](https://blog.enkr1.com)

---

## What I Built

### Inline Comments

Select any text on an article. A popup appears. Leave a comment anchored to that exact passage — Lark Docs style. Comments scroll-sync with their anchor text in a dedicated side panel.

- Google One Tap sign-in (Firebase Auth)
- Firestore real-time persistence
- Edit/delete your own comments and replies
- Responsive 3-column layout: sidebar + article + comments

### Floating Toolbar

Replaced the traditional sidebar menu with an icon-based floating toolbar on desktop. Clean, minimal, always accessible. Mobile gets a frosted-glass bottom nav instead.

### Search

Two interfaces, one index:
- **Cmd+K** — quick search modal from anywhere
- **/search/** — full page with keyword highlighting and `?highlight=` deep linking

### Content Features

- **Sticky posts** — pin to homepage with `sticky: N` in frontmatter
- **Backlinks** — automatic bidirectional linking between posts
- **Nested categories** — array frontmatter like `["A", "B", "C"]` auto-generates category trees
- **Scrollspy TOC** — highlights your current section as you read
- **Anchor flash** — heading flashes when you click a TOC link
- **Change badges** — recently modified posts get visual indicators
- **Reading progress** — scroll position bar at page top

### Analytics & Engagement

- **Per-article view counts** — Firestore-backed with session caching and cookie dedup
- **GA4 custom events** — reading depth milestones, active reading time, search tracking
- **Email subscriptions** — collected via Google Sheets + Apps Script
- **9+ comment providers** — Disqus, Giscus, Utterances, Waline, and more

### Media

- PhotoSwipe gallery with lightbox
- Dynamic color extraction from featured images (Vibrant.js)
- Animated SVG waveforms
- Responsive embeds: YouTube, Bilibili, Tencent, GitLab

### Design

Custom design tokens. Cormorant Garamond headings, Inter body, JetBrains Mono code. Light/dark/auto with system preference sync. Glassmorphism where it counts.

---

## Structure

```
assets/
├── ts/
│   ├── auth/              # Firebase Auth + Google One Tap
│   ├── auth-ui/           # Auth rendering (toolbar + sidebar)
│   ├── inline-comments/   # Anchored commenting system
│   ├── search.tsx         # Full-text search
│   ├── visitor-count.ts   # Firestore view tracking
│   └── waveform.ts        # SVG wave animations
├── scss/
│   ├── variables.scss     # Design tokens
│   └── partials/          # Component styles
scripts/
├── generate-categories.js # Nested category tree generator
└── generate-changes.js    # Change badge data from git
```

## Requirements

- Hugo extended v0.123.0+
- Firebase project (auth, comments, view counts)
- GA4 property (optional)

## Credits

Built on [Hugo Theme Stack](https://github.com/CaiJimmy/hugo-theme-stack) by Jimmy Cai. Licensed under GPL-3.0.
