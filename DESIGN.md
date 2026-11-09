---
version: alpha
name: ExamForge
description: A Bulgarian practice-exam workspace styled as a modern assessment sheet.
colors:
  primary: "#2563EB"
  ink: "#F8FAFC"
  muted: "#94A3B8"
  surface: "#151E30"
  background: "#090D18"
  line: "#293548"
  success: "#4ADE80"
  danger: "#FDA4AF"
typography:
  sans:
    fontFamily: "Segoe UI, Arial, sans-serif"
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

Runtime colors, type, and geometry live in `frontend/app/globals.css`. Display headings use compact Segoe UI Semibold, with tabular numerals for durations and scores. Monospace identifies question labels and positions. The default theme uses navy panels over a dark canvas. Light and system modes use the same semantic tokens. Blue marks primary actions, the current position, and chart data. Correct and incorrect states have text as well as color.

A desktop side rail anchors navigation. At narrow widths the same destinations appear in an expandable menu. Dashboard metrics wrap, forms become single-column, and the simulator retains a separate question navigator. All actions use a visible focus ring. Lucide icons reinforce text labels. Interactions transition only color and border and honor reduced motion.

Catalogue cards place the name and educational scope above the grade, topic count, and active question count. Grade selection precedes the cards. The configuration panel keeps the filtered count next to the form and preserves the choice between school material and personal topics.

Page and question changes use short opacity and position transitions inside the existing shell. The sidebar, theme control, form focus, and exam timer remain independent of route animation. The mobile drawer supports Escape and both themes use the same contrast roles.
