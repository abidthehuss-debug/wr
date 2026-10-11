# Workshop MVP Plan

## Project

Name: Community Events

One-sentence goal: A small local-events board where anyone can browse, add,
edit, and delete community events that persist in the browser.

Starter: workshop/starters/community-events

Project root: repository root

## What we are building

A single-page Community Events app: a headline list of upcoming events with a
simple form to add new ones, edit and delete controls on each event, required
field validation, and `localStorage` persistence so events survive a refresh.

## Who it is for

Target user or audience: neighbours who want one simple place to see and share
what is happening nearby.

## Core features

1. Browse a sorted list of upcoming events with title, date, location, category.
2. Add a new event through a validated form.
3. Edit and delete existing events, with changes persisted in `localStorage`.

## Constraints

Browser-only; no accounts, no backend, no external services. Sample events
appear on first launch.

## Technology

Chosen stack: React + Vite + plain CSS + browser `localStorage`.

Why this was chosen: the smallest workshop-supported stack that gives a real
interactive page with persistence, and it fits the deterministic Lavish visual
review path.

## How to run it

1. `npm install`
2. `npm run dev` and open the printed URL.
3. `npm run build` for a production build.

## Definition of Done

The full add/edit/delete journey works, events survive a refresh, the layout
reads clearly on narrow and wide screens, and the attendee has reviewed and
approved the final look through Lavish.

## Build Plan

### W01 - Scaffold the Vite React app

Status: DONE

Goal:

A running Vite + React scaffold at the repository root with the project title
visible.

Acceptance criteria:

- `npm run dev` serves a page titled Community Events.
- The repository ignores build output and dependencies.

Verification:

- Start the dev server and load the page.

Visual review: NO

Notes:

Completed: scaffolded with Vite 7 + React 19; base styles in `src/styles.css`.

### W02 - Event list with sample data

Status: DONE

Goal:

A sorted event list rendering seeded sample events with title, date, location,
and category.

Acceptance criteria:

- Three sample events render on first launch.
- Events are sorted by date.

Verification:

- Load the app with cleared storage and check the list.

Visual review: NO

Notes:

Completed: sample data in `src/events.js`; list markup in `src/App.jsx`.

### W03 - Add, edit, delete with persistence

Status: DONE

Goal:

Create, edit, and delete flows with required-field validation and
`localStorage` persistence.

Acceptance criteria:

- Submitting an incomplete form shows a clear error and saves nothing.
- A new event survives a page refresh.
- Edit and delete update both the page and stored data.

Verification:

- Exercise add, refresh, edit, and delete in the browser on the app's own
  origin.

Visual review: NO

Notes:

Completed: form state, validation, and storage wiring in `src/App.jsx` and
`src/events.js`. Refresh persistence verified on the dev-server origin.

### W04 - Responsive layout and visual polish

Status: DONE

Goal:

A clear, deliberate layout that works on narrow and wide screens.

Acceptance criteria:

- Cards stack on narrow viewports.
- Form, list, and actions are visually distinct and readable.

Verification:

- Resize the browser through phone and desktop widths.

Visual review: NO

Notes:

Completed: responsive card layout and form styling in `src/styles.css`.

### W05 - Final review and polish

Status: TODO

Goal:

The attendee reviews the finished app visually, reasonable feedback is
applied, and the result is verified.

Acceptance criteria:

- The production build opens in a Lavish review through the canonical
  `workshop/scripts/lavish-review` command.
- The attendee annotates the review and sends feedback.
- Reasonable in-scope feedback is applied to the real source and re-reviewed.
- The full add/edit/delete journey still works afterwards.

Verification:

- Complete the Lavish review loop until the attendee ends it.
- Re-run the production build and exercise the core journey.

Visual review: REQUIRED

Notes:

Everything before this step is complete; this session owns only the review
and polish.
