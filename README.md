# hugo-theme-enkr

A personalized fork of [Hugo Theme Stack](https://github.com/CaiJimmy/hugo-theme-stack) with a Ba Zi (八字) energy-inspired design system.

**Live:** [blog.enkr1.com](https://blog.enkr1.com)

## What's Different

This fork replaces Stack's default styling with a refined color system based on Chinese five-element theory:

| Element | Color | Usage |
|---------|-------|-------|
| 内蕴金 (Metal) | `#C9A882` Gold | Accents, hovers, CTAs |
| 智慧海 (Water) | `#1E4B8C` Navy | Links, code, tags |
| 流年曦 (Fire) | `#F59E0B` Amber | Dynamic interactions |

### Key Customizations

- **Typography**: Cormorant Garamond display + Inter body fonts
- **Cards**: Animated gold border trace on hover
- **Tags**: Transparent `#hashtag` style (no pill backgrounds)
- **Categories**: Collapsible tree widget in sidebar
- **Mobile**: Bottom navigation bar with frosted glass
- **Dark mode**: Full support with inverted palette

## Structure

```
assets/scss/
├── _mixins.scss      # Shared style mixins
├── variables.scss    # Ba Zi color tokens + theme variables
└── partials/
    ├── article.scss  # Post styling, tags, categories
    ├── widgets.scss  # Sidebar widgets, tag cloud
    └── ...
```

## Usage

This theme is designed for my personal blog. Feel free to fork, but note:

1. Colors and typography are opinionated for my aesthetic
2. Some features assume specific content structure (journals, nested categories)
3. The `custom.scss` in the parent Hugo project contains additional overrides

## Credits

- Original theme: [Hugo Theme Stack](https://github.com/CaiJimmy/hugo-theme-stack) by Jimmy Cai
- Licensed under GNU General Public License v3.0
