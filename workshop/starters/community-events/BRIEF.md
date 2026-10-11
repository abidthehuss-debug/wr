# Community Events Board

## Purpose

Build a simple, attractive web application where people can browse upcoming
community events and organisers can add their own events.

## Audience

The default audience is a small community organisation, charity, club, or local
group that wants one simple place to display upcoming activities. The idea can
be personalised for students, business networking, sports or social clubs,
community or faith groups, charities, workshops, professional events, or
another interest group. All supplied names and data are fictional.

## Core features

1. **Browse upcoming events.** Show responsive event cards with title, date,
   time, category, location or Online, and a short description. Support text
   search, category filtering, clear chronological display, and an empty state.
2. **Add and manage events.** Let an organiser add, edit, and delete events with
   clear basic validation. Persist changes in browser `localStorage`.
3. **Online event timezone helper.** For online events, show the time in a small
   set of choices: London, New York, Dubai, and Tokyo. Use browser-standard
   functionality such as `Intl.DateTimeFormat` in the finished app.

## Constraints

Keep the result simple, working, and polished. Do not add user accounts,
authentication, passwords, a database, a backend server merely for persistence,
payments, ticket purchasing, Google Maps, email, SMS, push notifications, real
personal or attendee data, external commercial APIs, admin roles, complex
permissions, or production hosting infrastructure. A responsive card/list UI
is enough; do not build a complicated calendar.

The starter directory is read-only reference material. Build the application at
the repository root using the normal workshop workflow; never scaffold or save
application code inside this directory.

## Suggested technology

- React for the page and interactive components;
- TypeScript to catch common mistakes;
- Vite for a small, quick development setup;
- straightforward maintainable CSS;
- browser `localStorage` for persistence.

In beginner language: we'll use React to build the page, TypeScript to help
catch mistakes, and the browser to store events so no database is needed.

## Sample data

Use [`sample-events.json`](sample-events.json). Each event has a deterministic
`dayOffset` rather than a permanently stale date. On first setup, the finished
app should turn each offset into a date relative to the current local day, then
store the initialized events. Do this once with simple date utilities; do not
create a date infrastructure layer.

## Definition of done

The responsive app displays the six demo events; search and category filtering
work; a user can add, edit, delete, and retain an event after refresh; online
event times render correctly in the four supported timezones; required fields
give clear errors; and the attendee has reviewed and approved the polished
result through Lavish. The app works without any MCP server.

## Suggested visual style

Default to a warm, welcoming community noticeboard: generous spacing, friendly
type, calm blue-green accents, clear category chips, accessible contrast, and
cards that work well on desktop and narrow screens. Personalise the name,
audience, and style from the attendee's three simple choices.

## Planning interview

Ask only three beginner-friendly choices: app name (default **Community Events
Board**), main audience (default **small local community group**), and visual
style (default **warm blue-green community noticeboard**). Accept “use the
defaults” as a complete response and ask no technical questions.

## Suggested five-step learning journey

### W01 - Create the application foundation

Set up React, TypeScript, and Vite at the repository root; establish the page;
derive dates from the supplied demo data; and prove the development server
runs. Sample events must be visible in a simple form. No backend or database.

Verification: install/build checks and open the running application.

Visual review: NO

### W02 - Build the events experience

Create responsive event cards, search, category filtering, chronological
display, and an empty state. Verify behavior at normal desktop and narrow
mobile widths.

Visual review: NO, unless Lavish would materially help.

### W03 - Add and manage events

Add create, edit, and delete flows, required-field validation, and
`localStorage` persistence. Write the storage code the way the real
application needs it; review-sandbox tolerance is the review tooling's job,
not the app's. Verify a new event survives refresh and that edit, delete, and
invalid input behave correctly.

Visual review: NO, unless UI feedback is genuinely needed.

### W04 - Add the online event timezone helper

Add source timezone data and the four target timezone choices. Use normal
browser code at runtime. During development, use the optional Time MCP to
independently check at least two representative conversions. If Time MCP is
unavailable, record that the optional check was skipped and verify with normal
tests instead; never block the build.

Visual review: NO, unless Lavish would materially help.

### W05 - Lavish review and final polish

Review the actual application's production build through the existing Lavish
skill and its tracked Vite review command. Apply reasonable in-scope
annotations, re-review when needed, and run the full core journey and
responsive checks. This review is required and the final result should look
deliberate rather than scaffolded.

Visual review: REQUIRED

Each generated plan step must include observable acceptance criteria and
specific verification, following `workshop/PLAN_TEMPLATE.md`.

## MCP learning opportunity

Time MCP is an optional tool for the coding agent, not part of the web app. In
W04 the agent can implement a conversion, ask Time MCP to independently convert
the same representative time, and compare the results. If it is unavailable,
continue using ordinary application testing.

## Lavish requirement

W05 must use the existing Lavish workflow through the canonical command —
`workshop/scripts/lavish-review open <project-root>` — which builds the app's
self-contained production review artifact; never an iframe around localhost or
a forwarded development URL. The attendee can annotate spacing, colour, type,
hierarchy, and controls; the build agent should apply reasonable feedback and
recheck the result. The generated artifact supplies in-memory Web Storage if
the Lavish sandbox denies the real APIs, so storage-dependent apps still open
for review. Verify true `localStorage` refresh persistence separately on the
real application origin because Lavish is the visual review surface.

## After-MVP stretch ideas

Do not include these in the initial plan. If the attendee finishes early,
suggest only one at a time: favourite events, a simple calendar-style view,
sorting by date or category, JSON export, dark mode, or richer category colours.
