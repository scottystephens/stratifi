# Stratiri Design System

This document outlines the design system used across the Stratiri platform.

## Brand Colors

### Primary - Deep Emerald
The primary brand color is **#047857** (Deep Emerald).

```
stratiri-50:  #f0fdf4  (Lightest - backgrounds)
stratiri-100: #dcfce7  (Light accents)
stratiri-200: #bbf7d0  (Badges, highlights)
stratiri-300: #86efac
stratiri-400: #4ade80
stratiri-500: #22c55e
stratiri-600: #16a34a
stratiri-700: #047857  ★ PRIMARY BRAND COLOR
stratiri-800: #065f46  (Hover states)
stratiri-900: #064e3b  (Dark accents)
stratiri-950: #022c22  (Darkest)
```

### Neutrals - Stone Palette
We use the `stone` palette for text and backgrounds:
- `stone-900` - Primary text
- `stone-500` - Secondary text
- `stone-400` - Muted text
- `stone-200` - Borders
- `stone-100` - Subtle backgrounds
- `stone-50` - Card backgrounds

### Semantic Colors
- **Positive**: `#047857` (stratiri-700) - Profits, positive changes
- **Negative**: `#dc2626` (red-600) - Losses, errors
- **Neutral**: `#6b7280` (gray-500) - Unchanged values

---

## Typography

### Font Families

**Display Font (Headlines):** Syne
- Used for: h1, h2, h3, page titles, hero text
- Apply with: `font-display` or `font-black` class

**Body Font:** Inter
- Used for: Body text, UI elements, labels
- Default font, no class needed

### Type Scale

```css
/* Display sizes (use with font-display) */
display-2xl: 4.5rem   /* Hero headlines */
display-xl:  3.75rem  /* Page titles */
display-lg:  3rem     /* Section titles */
display-md:  2.25rem  /* Card titles */
display-sm:  1.875rem /* Subsections */

/* Standard sizes */
text-xl:  1.25rem  /* Large body */
text-lg:  1.125rem /* Lead paragraphs */
text-base: 1rem    /* Body text */
text-sm:  0.875rem /* Small text, labels */
text-xs:  0.75rem  /* Captions, badges */
```

### Usage Examples

```jsx
// Hero headline
<h1 className="font-display text-display-xl font-black tracking-tight">
  See your cash. Clearly.
</h1>

// Section title
<h2 className="font-display text-3xl lg:text-4xl font-black tracking-tight">
  Features
</h2>

// Body text
<p className="text-lg text-stone-500 leading-relaxed">
  Description text here...
</p>
```

---

## Component Classes

### Layout

```css
.page-container        /* Full width with horizontal padding */
.page-container-narrow /* Centered, max-width container */
.page-section          /* Vertical section padding */
```

### Section Headers

```css
.section-label         /* Small uppercase label (e.g., "FEATURES") */
.section-label-line    /* Decorative line next to label */
.section-title         /* Large section title */
.section-description   /* Subtitle/description text */
```

### Cards

```css
.card-base            /* Basic card styling */
.card-elevated        /* Card with shadow */
.card-interactive     /* Card with hover effects */
.feature-card         /* Feature showcase card */
.float-card           /* Floating overlay card */
.float-card-accent    /* Accent colored floating card */
```

### Buttons

```css
.btn-primary          /* Primary action button */
.btn-primary-lg       /* Large primary button */
.btn-secondary        /* Secondary action */
.btn-ghost            /* Text-only button */
.btn-outline          /* Outlined button */
.cta-btn-primary      /* CTA section primary button */
.cta-btn-secondary    /* CTA section secondary button */
```

### Data Display

```css
.data-label           /* Small uppercase label */
.data-value           /* Standard data value */
.data-value-lg        /* Large data value (e.g., totals) */
.stat-value           /* Stats section value */
.stat-label           /* Stats section label */
```

### Badges

```css
.badge-positive       /* Green badge for positive values */
.badge-negative       /* Red badge for negative values */
.badge-neutral        /* Gray badge for neutral info */
```

### Navigation

```css
.nav-link             /* Navigation link styling */
.nav-blur             /* Blurred navigation background */
```

### Form Elements

```css
.input-base           /* Standard input field */
.input-label          /* Input label */
```

### Tables

```css
.table-header         /* Table header cell */
.table-cell           /* Table data cell */
.table-row            /* Table row with hover */
```

### Backgrounds

```css
.bg-grid              /* Subtle grid pattern */
.bg-gradient-subtle   /* Subtle gradient overlay */
```

### Trust Indicators

```css
.trust-item           /* Trust badge container */
.trust-icon           /* Trust badge icon */
```

---

## Usage Examples

### Feature Card

```jsx
<div className="feature-card group">
  <div className="feature-icon">
    <Globe className="feature-icon-inner" />
  </div>
  <h3 className="text-xl font-bold text-stone-900 mb-3">
    Multi-Currency Treasury
  </h3>
  <p className="text-stone-500 leading-relaxed">
    30+ currencies with real-time exchange rates.
  </p>
</div>
```

### Section Header

```jsx
<div className="text-center mb-16">
  <div className="flex items-center justify-center gap-3 mb-4">
    <span className="section-label-line"></span>
    <span className="section-label">Features</span>
    <span className="section-label-line"></span>
  </div>
  <h2 className="section-title mb-4">
    Built for modern treasury
  </h2>
  <p className="section-description max-w-2xl mx-auto">
    Everything you need to manage cash.
  </p>
</div>
```

### Data Card

```jsx
<div className="card-base p-6">
  <div className="data-label mb-2">Total Cash Position</div>
  <div className="data-value-lg">$12,847,350</div>
  <div className="badge-positive mt-2">
    <TrendingUp className="w-4 h-4" />
    +12.4%
  </div>
</div>
```

### CTA Section

```jsx
<section className="cta-section text-center">
  <h2 className="cta-title mb-6">
    Ready to see clearly?
  </h2>
  <p className="cta-description mb-10">
    Start free, no credit card required.
  </p>
  <div className="flex justify-center gap-4">
    <button className="cta-btn-primary">
      Get Started Free
      <ArrowRight className="w-5 h-5" />
    </button>
    <button className="cta-btn-secondary">
      Sign In
    </button>
  </div>
</section>
```

---

## Spacing Guidelines

### Section Spacing
- Between major sections: `py-24` (6rem / 96px)
- Between subsections: `py-16` (4rem / 64px)
- Section internal gaps: `gap-16` or `gap-20`

### Component Spacing
- Card padding: `p-6` to `p-8`
- Button padding: `px-6 py-3` (standard), `px-8 py-4` (large)
- Icon sizes: `w-4 h-4` (small), `w-6 h-6` (medium), `w-8 h-8` (large)

### Grid Gaps
- Card grids: `gap-6`
- Feature grids: `gap-4` to `gap-6`
- Stats: `gap-8` to `gap-16`

---

## Shadows

```css
shadow-card       /* Subtle card shadow */
shadow-card-hover /* Elevated card shadow */
shadow-stratiri   /* Standard shadow */
shadow-stratiri-md /* Medium shadow */
shadow-stratiri-lg /* Large shadow */
shadow-stratiri-xl /* Extra large shadow */
```

---

## Transitions

Standard transition: `transition-all duration-200` or `transition-colors`

For interactive elements, always include hover states:
- Buttons: Background color change
- Cards: Border color + shadow elevation
- Links: Color change
- Icons: Scale + color change

---

## File Structure

```
app/
├── globals.css          # Design system styles
├── layout.tsx           # Font loading
├── page.tsx             # Homepage (reference implementation)

tailwind.config.js       # Extended theme config

docs/
├── DESIGN_SYSTEM.md     # This file
```

---

## Quick Reference

| Element | Primary Class | Notes |
|---------|--------------|-------|
| Page wrapper | `page-container` | Full width + padding |
| Section | `page-section` | Vertical padding |
| Card | `card-elevated` | With shadow |
| Primary button | `btn-primary` | Green bg |
| Large CTA button | `btn-primary-lg` | Dark bg |
| Section title | `section-title` | Uses Syne font |
| Data value | `data-value-lg` | For totals |
| Positive badge | `badge-positive` | Green |
| Feature card | `feature-card` | With hover |

