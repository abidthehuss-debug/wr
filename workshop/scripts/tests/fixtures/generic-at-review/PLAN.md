# Workshop MVP Plan

## Project

Name: Note Tracker

One-sentence goal: A tiny note tracker where the attendee can add notes that
persist in the browser.

Starter: None

Project root: repository root

## What we are building

A one-page note tracker: a headline, an add-note button, and a list of note
cards persisted in `localStorage`.

## Who it is for

Target user or audience: the attendee, as their first self-built web page.

## Core features

1. See existing notes as cards.
2. Add a note with one click.
3. Notes persist across refresh via `localStorage`.

## Constraints

Browser-only; no backend; no accounts.

## Technology

Chosen stack: React + Vite + plain CSS + browser `localStorage`.

Why this was chosen: the smallest workshop-supported stack with a
deterministic visual review path.

## How to run it

1. `npm install`
2. `npm run dev` and open the printed URL.
3. `npm run build` for a production build.

## Definition of Done

Adding notes works, notes survive refresh, and the attendee has reviewed and
approved the final look through Lavish.

## Build Plan

### W01 - Scaffold the app

Status: DONE

Goal:

A running Vite + React scaffold with the app title visible.

Acceptance criteria:

- `npm run dev` serves the page with a heading.

Verification:

- Start the dev server and load the page.

Visual review: NO

Notes:

Completed: scaffolded with Vite + React.

### W02 - Note cards and add flow

Status: DONE

Goal:

Note cards render and the add button appends a new note.

Acceptance criteria:

- The seeded note renders on first launch.
- Clicking the add button appends a card.

Verification:

- Exercise the add flow in the browser.

Visual review: NO

Notes:

Completed: cards and add flow in `src/main.jsx`.

### W03 - Persistence

Status: DONE

Goal:

Notes survive a page refresh via `localStorage`.

Acceptance criteria:

- An added note is still present after refresh.

Verification:

- Add a note, refresh on the app's own origin, confirm it remains.

Visual review: NO

Notes:

Completed: storage wiring verified on the dev-server origin.

### W04 - Final review and polish

Status: TODO

Goal:

The attendee reviews the finished app visually, reasonable feedback is
applied, and the result is verified.

Acceptance criteria:

- The production build opens in a Lavish review through the canonical
  `workshop/scripts/lavish-review` command.
- The attendee annotates the review and sends feedback.
- Reasonable in-scope feedback is applied to the real source and re-reviewed.

Verification:

- Complete the Lavish review loop until the attendee ends it.
- Re-run the production build and exercise the add flow.

Visual review: REQUIRED

Notes:

Everything before this step is complete; this session owns only the review
and polish.
