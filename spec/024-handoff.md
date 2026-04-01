# Handoff 024 — Dark Mode Completion Pass

## What was implemented

Completed the dark-mode pass left open in handoff 023. Four components/pages were
missing dark variants; they are now fully styled to match the rest of the app.

## Files changed

- `app/signup/page.tsx` — dark variants on page bg, card, labels, inputs, error
  banner, submit button, and the "Already have an account?" footer link
- `app/alerts/unsubscribed/page.tsx` — dark variants on page bg, icon circles
  (amber + green), heading, body text, primary and secondary action links
- `components/TopicInput.tsx` — dark variants on mode-toggle border/bg, toggle
  buttons (active + inactive states), simple search input, and submit button
- `components/PICOForm.tsx` — dark variants on field labels, "(optional)" hint
  text, and all four text inputs

## Pattern used

All changes follow the same pattern established in handoff 023:
- Page backgrounds: `bg-gray-50 dark:bg-gray-950`
- Cards/surfaces: `bg-white dark:bg-gray-900`, `border-gray-200 dark:border-gray-700`
- Inputs: `bg-white dark:bg-gray-800`, `border-gray-300 dark:border-gray-600`,
  `text-gray-900 dark:text-gray-100`, `placeholder:text-gray-500 dark:placeholder:text-gray-400`
- Primary buttons: `bg-[#1e3a5f] dark:bg-blue-700` hover `dark:hover:bg-blue-600`
- Secondary / ghost links: `border-gray-300 dark:border-gray-600`,
  `text-gray-700 dark:text-gray-300`
- Headings: `text-[#1e3a5f] dark:text-blue-300`
- Body text: `text-gray-600 dark:text-gray-400`

## Checks run
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npx tsc --noEmit` — ✅ 0 errors

## Remaining work (from 004-market-research.md)

1. **Boolean search operators** — let users type `AND`, `OR`, `NOT`, `"phrase"`
   in the simple search box; parse client-side and pass as structured query
2. **Protocol versioning UI** — `protocol_status` / `protocol_version` columns
   exist in DB; add "Save draft" vs "Publish" buttons in `ResultsDashboard`
   protocol block
3. **PROSPERO / ClinicalTrials.gov badge** — show a badge on results indicating
   whether a matching registration was found
