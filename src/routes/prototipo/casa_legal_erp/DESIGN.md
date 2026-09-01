---
name: CASA LEGAL ERP
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3e4a3f'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a6f'
  outline-variant: '#bdcabc'
  surface-tint: '#006d3a'
  primary: '#006a39'
  on-primary: '#ffffff'
  primary-container: '#008649'
  on-primary-container: '#f6fff4'
  inverse-primary: '#64dd91'
  secondary: '#755b00'
  on-secondary: '#ffffff'
  secondary-container: '#fed255'
  on-secondary-container: '#735a00'
  tertiary: '#5a5c5d'
  on-tertiary: '#ffffff'
  tertiary-container: '#727576'
  on-tertiary-container: '#fbfdfe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#82faab'
  primary-fixed-dim: '#64dd91'
  on-primary-fixed: '#00210e'
  on-primary-fixed-variant: '#00522b'
  secondary-fixed: '#ffe08e'
  secondary-fixed-dim: '#ecc246'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#584400'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#444748'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  max-width: 1440px
---

## Brand & Style
The design system for this legal management platform is built on the pillars of **Authority, Precision, and Flow**. It targets legal professionals who require high-density information management without the cognitive load typically associated with legacy ERPs.

The aesthetic is a sophisticated blend of **Corporate Modern** and **Minimalism**, taking the structured clarity of Notion, the technical polish of Stripe, and the performance-oriented utility of Linear. The UI evokes a sense of "digital craftsmanship"—where every border, shadow, and transition feels intentional and high-end. 

The emotional response should be one of "calm control." By utilizing expansive whitespace and a refined color palette, the interface transforms complex legal workflows into a streamlined, premium experience.

## Colors
This design system utilizes a high-contrast palette anchored by **Emerald Green**, symbolizing growth and vitality, and **Elegant Gold**, signifying prestige and excellence.

- **Primary (Emerald Green):** Used for primary actions, success states, and key brand moments. It is the color of "forward motion."
- **Secondary (Elegant Gold):** Reserved for premium indicators, subtle accents, and high-level status highlights. It should be used sparingly to maintain its impact.
- **Backgrounds:** Surfaces are **Pure White**, while backgrounds utilize a very subtle emerald-tinted grey (#F1F5F3) to provide depth and reduce eye strain during long hours of legal research.
- **Accents:** High-performance dark modes or sidebars use a deep Charcoal (#1A1D1E) to provide a grounded, sophisticated frame for the content.

## Typography
The system relies on **Inter** for its incredible legibility and neutral, professional character. The hierarchy is strictly enforced through weight and letter spacing rather than just size.

- **Headlines:** Use semi-bold weights with slight negative letter-spacing to create a "locked-in," authoritative look for section headers.
- **Body:** Standardized at 14px for data density without sacrificing readability. Line height is kept generous (1.5x) to prevent text-heavy legal documents from feeling claustrophobic.
- **Labels:** Small caps and increased tracking are used for secondary metadata to differentiate it clearly from primary body text.

## Layout & Spacing
The layout follows a **Hybrid Fluid Grid** model. On desktop, the main content area is capped at a 1440px max-width to maintain readability, while the sidebar remains fixed.

- **Grid:** A 12-column system with a 24px gutter is used for the main dashboard.
- **Rhythm:** An 8pt spatial system governs all padding and margins. 
- **Adaptation:** On mobile, margins shrink to 16px and the 12-column grid collapses to a single column. KPI cards reflow into a vertical stack or a horizontal scrollable carousel to preserve glanceability.
- **Sidebar:** The collapsible navigation is 260px wide (expanded) and 72px (collapsed), utilizing a slide-and-push animation.

## Elevation & Depth
Depth is created through **Tonal Layering** and **Ambient Shadows**. This design system avoids harsh blacks, opting for soft, diffused shadows tinted with the primary Emerald Green to suggest a natural physical presence.

- **Level 0 (Base):** Background tint (#F8FAFB).
- **Level 1 (Cards):** Pure white surface with a 1px border (#E2E8F0) and a very subtle shadow (0px 1px 3px rgba(15, 157, 88, 0.05)).
- **Level 2 (Dropdowns/Modals):** High elevation with a more pronounced shadow (0px 10px 15px -3px rgba(15, 157, 88, 0.1)).
- **Level 3 (Global Search):** Floating "Command Palette" style with a backdrop blur (12px) and a gold-tinted subtle outer glow to signify its importance.

## Shapes
The shape language is modern and approachable. A **12px (0.75rem)** base corner radius is applied to all primary containers (Cards, Modals, Input Fields) to create the "soft-tech" feel.

- **Buttons:** Use a 8px radius for a more precise, functional appearance.
- **Search Bars:** Utilize a pill-shaped (full-round) radius to distinguish them as high-priority global interaction points.
- **KPI Indicators:** Small badges and chips use a 6px radius to remain distinct from larger UI containers.

## Components
Consistent component styling ensures the platform feels like a single cohesive tool.

- **Buttons:** Primary buttons are solid Emerald Green with white text. Secondary buttons use a Ghost style with an Emerald border. Premium/VIP features use a subtle Gold gradient border.
- **KPI Cards:** Feature a large "Display" numeral, a trend sparkline (Stripe-inspired), and a subtle background glow reflecting the status (Green for positive, Red for alert).
- **Data Tables:** High-density with 1px horizontal dividers only. Row hover states use a very light Emerald tint (#F1FDF7) to assist line-tracking.
- **Global Search (Ctrl+K):** A centered modal with a backdrop blur. It features categorised results (Cases, Clients, Documents) with "Recent" history for high-performance navigation.
- **Input Fields:** 12px rounded corners with a 1px #E2E8F0 border. On focus, the border transitions to Emerald Green with a 3px soft focus ring.
- **Collapsible Sidebar:** Dark Charcoal background (#1A1D1E). Active states use a "left-border highlight" in Gold and a subtle background shift to suggest depth.