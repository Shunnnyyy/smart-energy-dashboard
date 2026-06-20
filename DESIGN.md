# Urban Field Instrument Design System

## 01. Reference Direction

This project uses a practical field-instrument style inspired by IBM Carbon Design System, Figma dashboard templates, and monochrome grid editorial layouts. The goal is not to look like a generic SaaS site. It should feel like a personal energy observation tool: measured, quiet, technical, and useful.

Reference links:

- IBM Carbon Design System Figma kits: https://carbondesignsystem.com/designing/kits/figma/
- Figma dashboard templates: https://www.figma.com/templates/dashboard-designs/
- Data visualization kit references: https://www.figma.com/templates/dashboard-designs/

## 02. Palette

- Paper: `#f8fafc`
- Ink: `#0f172a`
- Muted ink: `#475569`
- Rule line: `rgba(15, 23, 42, 0.10)`
- Load accent: `#2563eb`
- Shift accent: `#22c55e`

Use blue/green only for data states. The page should still feel mostly neutral and readable.

## 03. Typography

- Primary: IBM Plex Sans
- Technical labels: IBM Plex Mono
- Headings: heavy, compact, left-aligned
- Body: 1.55 to 1.75 line-height
- Labels: small uppercase mono, but only for short metadata

Avoid centered paragraphs and oversized marketing sections.

## 04. Components

- Sidebar: stable repeated-use navigation.
- Dashboard cards: only for metrics, charts, and controls.
- Scenario chips: compact, scan-friendly presets.
- Buttons: clear primary/secondary contrast, visible focus ring.
- Data rows: hover may show a current or cost state.

## 05. Motion

Motion should explain scheduling:

- Load shift: horizontal movement showing timing changes.
- Flow nodes: sparse movement across the scheduling rail.

Do not animate every object. Respect `prefers-reduced-motion`.

## 06. UX Rule

Each page should answer one practical question:

- Overview: What is the current pattern?
- Usage: Where does the load come from?
- Insights: What should I test next?
- Settings: What assumptions control the model?
