# Stratiri Brand Identity

**Tagline**: *Strategic Financial Intelligence*

---

## 🎨 Brand Concept

**Stratiri** combines "Strategy" + "Finance" - representing intelligent, strategic financial management.

### Brand Personality
- **Professional** - Enterprise-grade financial platform
- **Intelligent** - Data-driven insights and analytics
- **Modern** - Clean, contemporary interface
- **Trustworthy** - Secure, reliable, compliant
- **Powerful** - Comprehensive features for complex needs

---

## 🎨 Color Palette

### Primary Colors
```
Stratiri Blue (Primary)
- #0066FF - Bright, confident blue
- Usage: Primary actions, nav highlights, main CTAs

Stratiri Deep Blue (Secondary)
- #003D99 - Deep, trustworthy blue
- Usage: Headers, important text, hover states

Stratiri Navy (Accent)
- #001F4D - Professional navy
- Usage: Backgrounds, dark mode, footer
```

### Neutral Colors
```
Slate Gray (Text)
- #1E293B - Primary text
- #475569 - Secondary text
- #94A3B8 - Muted text

Backgrounds
- #FFFFFF - White (cards, surfaces)
- #F8FAFC - Light gray (page background)
- #F1F5F9 - Subtle gray (secondary backgrounds)
```

### Accent Colors
```
Success Green
- #10B981 - Positive actions, success states

Warning Amber
- #F59E0B - Warnings, pending states

Error Red
- #EF4444 - Errors, destructive actions

Info Cyan
- #06B6D4 - Information, insights
```

### Financial Data Colors
```
Revenue/Income
- #10B981 - Green (positive cash flow)

Expense/Outflow
- #EF4444 - Red (negative cash flow)

Neutral/Transfer
- #6366F1 - Indigo (internal transfers)
```

---

## 🔤 Typography

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale
```
H1: 2.5rem (40px) - Bold - Page titles
H2: 2rem (32px) - Semibold - Section headers
H3: 1.5rem (24px) - Semibold - Card titles
H4: 1.25rem (20px) - Medium - Subsections
Body: 1rem (16px) - Regular - Content
Small: 0.875rem (14px) - Regular - Captions
Tiny: 0.75rem (12px) - Regular - Labels
```

---

## 📐 Logo Design

### Primary Logo
```
┌─────────────────────────────┐
│    ╔═══╗                    │
│    ║ S ║  STRATIFI          │
│    ╚═══╝                    │
│                             │
│ Strategic Financial         │
│ Intelligence                │
└─────────────────────────────┘
```

### Iconmark (Sidebar/Favicon)
```
╔═══╗
║ S ║
╚═══╝
```

**Design Elements:**
- Bold "S" in a geometric frame
- Represents structure, security, stability
- Finance industry standard (geometric, trustworthy)
- Works at any size (scalable)

### Color Variants
- **Primary**: White S on #0066FF background
- **Dark**: #0066FF S on dark background
- **Monochrome**: Gray on white for formal docs

---

## 🎯 Design Principles

### 1. White Space
- **Generous padding** - Minimum 2rem (32px) on main containers
- **Card spacing** - 1.5rem (24px) gap between cards
- **Section spacing** - 3rem (48px) between major sections
- **Breathing room** - Don't cram content

### 2. Visual Hierarchy
- **Clear headers** - Bold, distinct size differences
- **Card-based layouts** - Group related information
- **Consistent spacing** - Predictable rhythm
- **Strategic color use** - Draw attention where needed

### 3. Data Display
- **Tables** - Clean, striped rows, hover effects
- **Charts** - Professional color palette, clear labels
- **Numbers** - Prominent display with proper formatting
- **Status indicators** - Color-coded badges, icons

### 4. Interactions
- **Smooth transitions** - 200ms ease-in-out
- **Hover states** - Clear visual feedback
- **Loading states** - Professional spinners, skeletons
- **Error states** - Helpful, clear messaging

---

## 📱 Responsive Design

### Breakpoints
```
Mobile: < 640px
Tablet: 640px - 1024px
Desktop: 1024px - 1440px
Wide: > 1440px
```

### Navigation
- **Desktop**: Full sidebar (256px expanded, 64px collapsed)
- **Tablet**: Collapsible sidebar
- **Mobile**: Slide-out drawer

---

## 🎨 UI Components

### Cards
```
Background: White (#FFFFFF)
Border: 1px solid #E2E8F0
Border Radius: 0.75rem (12px)
Shadow: 0 1px 3px rgba(0,0,0,0.1)
Hover: 0 4px 6px rgba(0,0,0,0.1)
Padding: 1.5rem (24px)
```

### Buttons
```
Primary: #0066FF background, white text, bold
Secondary: White background, #0066FF border & text
Ghost: Transparent, hover gray background
Destructive: #EF4444 background/text
```

### Badges
```
Success: #10B981 background, white text
Warning: #F59E0B background, white text
Error: #EF4444 background, white text
Info: #06B6D4 background, white text
Neutral: #94A3B8 background, white text
```

---

## 🏷️ Voice & Tone

### General
- **Professional but friendly**
- **Clear and concise**
- **Avoid jargon** (explain when necessary)
- **Action-oriented**

### UI Copy Examples
```
✓ "Import Transactions" (not "Upload File")
✓ "Link to Account" (not "Associate Account")
✓ "View Details" (not "See More")
✓ "Save Changes" (not "Submit")
```

---

## 📊 Data Visualization

### Chart Colors
```
Primary Series: #0066FF
Secondary Series: #06B6D4
Tertiary Series: #8B5CF6
Comparison: #10B981 vs #EF4444
```

### Number Formatting
```
Currency: $1,234.56 (locale-aware)
Percentages: 12.34%
Large numbers: 1.2M, 5.3K (abbreviated)
Dates: MMM DD, YYYY (e.g., Jan 15, 2025)
```

---

## ✨ Signature Elements

### Geometric Patterns
- **Subtle grid backgrounds** for data-heavy pages
- **Gradient accents** on hero sections
- **Line separators** with gradient fades

### Micro-interactions
- **Button press** - Slight scale down
- **Card hover** - Lift up with shadow
- **Tab switch** - Smooth slide animation
- **Data load** - Skeleton screens

---

## 🎯 Implementation Checklist

- [ ] Update Tailwind config with Stratiri colors
- [ ] Create logo component
- [ ] Update navigation with new branding
- [ ] Redesign pages with better spacing
- [ ] Update all text references
- [ ] Create favicon and app icons
- [ ] Update meta tags (title, description)
- [ ] Test on all screen sizes
- [ ] Verify color contrast (WCAG AA)
- [ ] Polish interactions and animations

---

**Brand Status**: Ready for implementation
**Design System**: Defined
**Next Step**: Execute rebrand across codebase

