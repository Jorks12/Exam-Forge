---
version: alpha
name: ExamForge
description: A Bulgarian practice-exam workspace styled as a modern assessment sheet.
colors:
  primary: "#2563EB"
  ink: "#F8FAFC"
  muted: "#94A3B8"
  surface: "#11182A"
  card: "#151D30"
  raised: "#1E293B"
  background: "#0B1020"
  line: "#28354B"
  success: "#4ADE80"
  danger: "#FDA4AF"
typography:
  sans:
    fontFamily: "Segoe UI Variable, Segoe UI, system-ui, Arial, sans-serif"
  mono:
    fontFamily: "Consolas, ui-monospace, monospace"
rounded:
  md: "0.65rem"
  lg: "1rem"
spacing:
  page-max: "78rem"
---

# ExamForge

Students and individual educators work in Bulgarian on both desktop and mobile. The printed answer sheet is the reference. Numbered cells carry actual question positions, answered states, or values. A blue assessment-sheet illustration identifies the workspace on sign-in and dashboard screens.

Runtime colors, type, and geometry live in `frontend/app/globals.css`. The Bulgarian interface uses the local Segoe UI family and system fallbacks. Tabular numerals align scores and the timer. Monospace identifies answer labels and positions. Blue marks primary actions, the current position, and chart data. Correct and incorrect states also have text labels.

| Token | Dark | Light |
|---|---|---|
| Canvas | `#0B1020` | `#F8FAFC` |
| Navigation | `#11182A` | `#FFFFFF` |
| Cards | `#151D30` | `#FFFFFF` |
| Raised surface | `#1E293B` | `#F1F5F9` |
| Structural border | `#28354B` | `#E2E8F0` |
| Primary action | `#2563EB` | `#2563EB` |
| Action hover | `#1D4ED8` | `#1D4ED8` |
| Main text | `#F8FAFC` | `#0F172A` |
| Supporting text | `#94A3B8` | `#52637A` |

A desktop side rail anchors navigation. At narrow widths the same destinations appear in a modal drawer. Dashboard metrics wrap, forms become single-column where needed, and the simulator retains a separate question navigator. Focus rings remain visible around controls. Lucide icons reinforce text labels. Surface colors, borders and a consistent radius scale establish hierarchy, with shadow reserved primarily for raised controls and overlays.

Catalogue cards place the name and educational scope above the grade, topic count, and active question count. Grade selection precedes the cards. The configuration panel keeps the filtered count next to the form and preserves the choice between school material and personal topics.

Page and question changes use short opacity and position transitions inside the existing shell. The sidebar, theme control, form focus, and exam timer remain independent of route animation. The mobile drawer supports Escape and both themes use the same contrast roles.

## Redesign audit checklist

- [x] Replace competing gradients and action styles with shared surface, typography and focus tokens.
- [x] Give the sidebar a clear current-page state and make the drawer and profile disclosure operable by keyboard.
- [x] Put the most recent exams and measured progress at the center of the dashboard.
- [x] Make exam setup stages visible and give answer cards, timer and result status distinct, legible treatments.
- [x] Align search and filters, input validation, loading, empty states and confirmation dialogs with the same components.
- [x] Check light and dark themes, account and privacy screens, and data layouts at 375, 768, 1280 and 1600 px.

## Implementation files

| Area | Files |
|---|---|
| Tokens, responsive layout and shared states | `frontend/app/globals.css`, `frontend/components/ui.tsx` |
| Workspace navigation and account presentation | `frontend/components/layout.tsx`, `frontend/components/settings.tsx`, `frontend/app/(dashboard)/dashboard/loading.tsx` |
| Dashboard and score presentation | `frontend/components/dashboard.tsx`, `frontend/components/metrics.tsx`, `frontend/components/analytics.tsx`, `frontend/components/analytics-charts.tsx`, `frontend/lib/contracts.ts` |
| Exam configuration, simulator and results | `frontend/components/exams.tsx`, `frontend/components/catalogue.tsx` |
| Question bank and sign-in | `frontend/components/questions.tsx`, `frontend/components/auth.tsx` |
| UI cleanup and verification | `frontend/components/question-quality.tsx`, `frontend/components/review.tsx`, `frontend/tests/coursework.spec.ts`, `UX-CONTRACT.md` |

## Verification

Seven Playwright scenarios passed in Microsoft Edge against the compiled frontend and the local Express and PostgreSQL fixtures. The viewport checks cover 14 routes at 375, 768, 1280 and 1600 CSS pixels in both themes. Targeted checks cover keyboard navigation and focus restoration, reduced motion, the question editor’s inline error, and login and Settings rendering with JavaScript disabled. The account checks at the server boundary use the existing authentication flow.

Four cold dashboard loads on each build produced these encoded resource sizes and application request counts.

| Metric | Before | After |
|---|---:|---:|
| Dashboard API requests | 3 | 2 |
| JavaScript | 169.1 kB | 170.3 kB |
| CSS | 8.6 kB | 9.1 kB |

Calculated contrast is 5.17:1 for white primary-action text, 6.55:1 for muted text on dark cards and 6.13:1 for muted text on light cards. Input outlines are above 3:1 against their respective field surfaces. The checks cover the specified browser, viewport widths and token pairs. A full accessibility audit and checks on physical mobile devices remain outside this verification.
