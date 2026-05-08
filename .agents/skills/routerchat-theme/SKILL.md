---
name: routerchat-theme
description: "RouterChat theme analysis for light and dark modes in apps/web. Use when summarizing, updating, or re-implementing the web theme (colors, typography, shadows, motion, utilities)."
---

# RouterChat theme reference

## Quick start

- Read `apps/web/src/app/globals.css` for theme tokens and utilities.
- Treat `:root` as dark mode (MIDNIGHT SLATE) and `.light` as light mode (DREAMSICLE).
- Read `apps/web/src/app/layout.tsx` for font variables.
- Read `apps/web/src/contexts/SettingsContext.tsx` for theme application logic (root class switching).
- Use the `@theme` mapping in `apps/web/src/app/globals.css` to understand how Tailwind color utilities resolve to CSS variables.

## Theme tokens

### Dark mode (MIDNIGHT SLATE) in `:root`

- Base
    - `--background: #0b0d12`
    - `--background-elevated: #13161d`
    - `--foreground: #eaecf0`
    - `--foreground-muted: #8b919e`
- Accents
    - `--primary: #a5b4fc`
    - `--primary-glow: rgba(165, 180, 252, 0.15)`
    - `--primary-foreground: #0b0d12`
    - `--secondary: #86efac`
    - `--secondary-foreground: #0b0d12`
    - `--accent: #f9a8d4`
    - `--accent-foreground: #0b0d12`
- Neutrals
    - `--muted: #1a1d26`
    - `--muted-foreground: #6b7280`
    - `--border: #252a36`
    - `--border-accent: rgba(165, 180, 252, 0.25)`
    - `--input: #1a1d26`
    - `--ring: #a5b4fc`
- Status
    - `--success: #34d399`
    - `--warning: #fbbf24`
    - `--error: #f87171`
- Shadows
    - `--shadow-deco: 0 4px 24px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(165, 180, 252, 0.08)`
    - `--shadow-elevated: 0 8px 32px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(165, 180, 252, 0.12)`
    - `--shadow-glow: 0 0 24px rgba(165, 180, 252, 0.15)`

### Light mode (DREAMSICLE) in `.light`

- Base
    - `--background: #fdf8f3`
    - `--background-elevated: #ffffff`
    - `--foreground: #2a2523`
    - `--foreground-muted: #7a706a`
- Accents
    - `--primary: #f97316`
    - `--primary-glow: rgba(249, 115, 22, 0.12)`
    - `--primary-foreground: #ffffff`
    - `--secondary: #fdba74`
    - `--secondary-foreground: #2a2523`
    - `--accent: #ea580c`
    - `--accent-foreground: #ffffff`
- Neutrals
    - `--muted: #fef3eb`
    - `--muted-foreground: #9a8d85`
    - `--border: #f5e6da`
    - `--border-accent: rgba(249, 115, 22, 0.3)`
    - `--input: #ffffff`
    - `--ring: #f97316`
- Status
    - `--success: #22c55e`
    - `--warning: #f59e0b`
    - `--error: #ef4444`
- Shadows
    - `--shadow-deco: 0 4px 24px -4px rgba(42, 37, 35, 0.08), 0 0 0 1px rgba(249, 115, 22, 0.08)`
    - `--shadow-elevated: 0 8px 32px -8px rgba(42, 37, 35, 0.12), 0 0 0 1px rgba(249, 115, 22, 0.12)`
    - `--shadow-glow: 0 0 24px rgba(249, 115, 22, 0.15)`

### Shared tokens and mechanics

- Preserve `--radius: 2px` and global `border-radius: var(--radius)` default.
- Preserve font variables from `apps/web/src/app/layout.tsx`:
    - `--font-display` uses Outfit.
    - `--font-mono` uses IBM Plex Mono.
- Keep dark as the default in `:root` and apply light via `.light` class on `documentElement`.
- Remember the Tailwind `dark` variant uses `.dark` because of `@custom-variant dark (&:is(.dark *))` in `globals.css`.

## Component motifs

- Buttons: `.btn-deco`, `.btn-deco-primary`, `.btn-deco-secondary`, `.btn-deco-ghost` use top highlight, hover lift, and shadow tiers.
- Inputs: `.input-deco` uses inset shadow and `--primary-glow` focus ring.
- Cards: `.card-deco` uses art deco corners; `.card-minimal` uses muted surface and accent border.
- Utilities: `.text-gradient-primary`, `.divider-deco`, `.glow-gold`, `.accent-line`, `.border-deco`.
- Motion: `--animate-*` tokens and `animate-*` classes define slide, fade, shimmer, pulse, and typing dots.

## Iconography

- Avoid emojis as icons; use dedicated icon glyphs instead.
- Keep icon style consistent across surfaces (stroke weight, corner style).
- Use semantic coloring: default for neutral actions, accent for primary, warning/danger for destructive.
- Pair icons with clear labels when actions aren't obvious.
- Avoid mixing filled and outline styles within the same view.

## Output format

- Provide two separate sections: Light and Dark.
- For each, list base, accents, neutrals, status, shadows, and typography.
