<p align="center">
  <img src="Muse_logo.png" alt="Muse Logo" width="180" />
</p>

<h1 align="center">Muse</h1>

<p align="center">
  <strong>Autonomous Task Scheduling Engine</strong><br/>
  A deterministic, constraint-satisfaction scheduling system that dynamically maps flexible tasks into rigid temporal availability windows — without requiring human intervention.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-32.3.3-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Theme-Nord-5E81AC" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## What is Muse?

Muse is an **autonomous task scheduler** inspired by [FlowSavvy](https://flowsavvy.app). Unlike static task managers or manual time-blocking tools, Muse runs a **constraint-satisfaction algorithm** that evaluates task duration, deadlines, priorities, dependencies, scheduling hour profiles, and event buffers to construct a mathematically optimized schedule — then **automatically recalculates** when reality deviates from the plan.

When a meeting runs over, a task gets skipped, or a deadline changes — hit **Recalculate** and the engine purges all future placements and regenerates an optimal schedule from the present moment forward.

### Key Differentiators

- **Deterministic Algorithm** — No LLMs, no hallucinations. A dedicated constraint-satisfaction solver evaluates thousands of permutations to map tasks into available time windows.
- **Autonomous Rescheduling** — Missed a task? The engine automatically reschedules remaining work into future availability.
- **Priority Supersedes Deadline** — When conflicts arise, high-priority tasks are preserved even if it means a low-priority task misses its deadline. The sacrificed task turns red.
- **Balanced vs Front-Load Distribution** — Choose between evenly spreading work across days (prevents burnout) or greedily packing everything into the earliest slots (clears your queue fast).
- **Cross-Platform** — Desktop (Electron), Web (PWA), and Mobile (responsive browser + Android WebView APK).
- **Cloud Sync** — Supabase-powered authentication and real-time data sync across devices.

---

## Screenshots

> *The interface uses the [Nord](https://www.nordtheme.com/) color palette — a cold, arctic blue theme with both dark and light modes.*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Electron Shell                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   React + Vite SPA                   │   │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │   │
│  │  │ Sidebar  │ │ Calendar  │ │  Floating Modals   │  │   │
│  │  │ (Lists,  │ │ (Day/3D/  │ │  (Task, Event,     │  │   │
│  │  │  Inbox,  │ │  Week)    │ │   Settings)        │  │   │
│  │  │  Missed) │ │           │ │                    │  │   │
│  │  └──────────┘ └───────────┘ └────────────────────┘  │   │
│  │                      │                               │   │
│  │               ┌──────┴──────┐                        │   │
│  │               │   Zustand   │                        │   │
│  │               │    Store    │                        │   │
│  │               └──────┬──────┘                        │   │
│  │          ┌───────────┼───────────┐                   │   │
│  │    ┌─────┴─────┐ ┌───┴───┐ ┌────┴─────┐             │   │
│  │    │ Scheduler │ │Repeat │ │  Depend  │             │   │
│  │    │  Engine   │ │ Gen   │ │  Graph   │             │   │
│  │    └───────────┘ └───────┘ └──────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  LAN Sync     │  │  Cloud Sync  │  │  Persistence   │   │
│  │  Server       │  │  (Supabase)  │  │  (localStorage │   │
│  │  (HTTP+PIN)   │  │              │  │   + IndexedDB) │   │
│  └───────────────┘  └──────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 32.3.3 |
| Frontend | React 18 + TypeScript 5.6 |
| Build Tool | Vite 5.4 |
| State Management | Zustand 4.5 |
| Styling | TailwindCSS 3.4 + Nord Theme |
| Persistence | localStorage + IndexedDB (dual-write) |
| Cloud Sync | Supabase (Auth + PostgreSQL) |
| LAN Sync | Custom HTTP server with PIN authentication |
| Icons | Lucide React |
| Date Handling | date-fns 3.6 |

---

## Scheduling Engine — Deep Dive

The scheduling engine (`src/engine/scheduler.ts`) is a **constraint-satisfaction solver** that runs in 9 stages:

### Pipeline

```
1. Compute Urgency Colors (Green/Orange/Red)
2. Handle Auto-Ignore (garbage-collect missed repeating tasks)
3. Filter schedulable tasks (autoSchedule, !completed, !inbox, remaining > 0)
4. Sort by scheduling priority
5. Build busy map (events + buffers + manually pinned tasks)
6. Build available slots per scheduling-hours profile
7. Clear all existing auto-scheduled blocks
8. Run constraint-satisfaction placement algorithm
9. Recalculate urgency colors after placement
```

### Priority Sort Order

The engine sorts tasks for placement in this strict order:

1. **Red urgency** (overdue) — scheduled first, front-loaded aggressively
2. **Orange urgency** (danger zone) — front-loaded aggressively
3. **Priority** (High > Medium > Low > None) — **priority supersedes deadline**
4. **Due date** (earlier deadline first)
5. **Remaining duration** (shorter tasks first, for optimal bin-packing)

### Workload Distribution Models

| Model | Behavior |
|-------|----------|
| **Balanced** (default) | Calculates `remaining_duration ÷ days_until_deadline` and distributes work evenly across days. Per-task daily cap with 1.3x flexibility factor. |
| **Front-Load** | Greedy algorithm. Packs every task into the earliest available slot. |

Both models force-front-load Red and Orange urgency tasks regardless of the global setting.

### Task Splitting

Large tasks (e.g., a 10-hour research report) are unlikely to find contiguous 10-hour blocks. When `splittable = true`, the engine fractures the task into multiple blocks distributed across available gaps. The `minBlockDuration` field prevents hyper-fragmentation (e.g., no useless 5-minute blocks for deep-focus work).

### Dependencies

Tasks can declare dependencies via `dependsOn: string[]`. The engine:
1. Computes the finish timestamp of all prerequisite tasks
2. Sets that as the effective `startAfter` for the dependent task
3. If a prerequisite is incomplete and unscheduled, the dependent task is **blocked** (not scheduled)
4. Circular dependency detection via DFS prevents infinite loops

### Scheduling Hours (Temporal Masks)

Each task can be assigned to a **Scheduling Hours Profile** — a 168-hour weekly boolean grid defining when that type of work is allowed. Examples:

- **Deep Work**: Mon–Wed 06:00–10:00
- **Admin**: Fridays 13:00–16:00
- **Personal**: Weekends all day

The engine intersects each task's duration exclusively with its assigned profile's available blocks, ignoring all other free time.

### Event Buffers

Events support `bufferBefore` and `bufferAfter` (in minutes). These create impenetrable dead zones around events — the engine treats buffer time identically to busy blocks, protecting transit and decompression time.

### Auto-Scheduling Cutoff

The engine stops scheduling beyond a configurable horizon (default: 8 weeks). Days beyond the cutoff display gray stripes in the UI. This prevents unbounded computation and keeps the algorithm fast.

---

## Data Model

### Events vs Tasks — Strict Ontological Separation

| | Events | Tasks |
|---|--------|-------|
| **Nature** | Rigid temporal anchors | Fluid algorithmic entities |
| **Movable** | Never | Always (when auto-scheduled) |
| **Engine behavior** | Treated as impenetrable walls | Placed, split, and shuffled |
| **Examples** | Meetings, appointments | "Write report", "Study chapter 5" |

### Task Properties

| Property | Type | Purpose |
|----------|------|---------|
| `autoSchedule` | boolean | Engine controls placement vs. manually pinned |
| `duration` | int (mins) | Total work required |
| `progress` | int (mins) | Work completed — engine schedules `duration - progress` |
| `dueDate` | datetime | Absolute deadline |
| `startAfter` | datetime | Earliest possible start |
| `schedulingHoursId` | FK | Links to temporal mask profile |
| `priority` | enum | High / Medium / Low / None |
| `splittable` | boolean | Can be fractured into multiple blocks |
| `minBlockDuration` | int (mins) | Anti-fragmentation shield |
| `dependsOn` | string[] | Task IDs that must complete first |
| `autoIgnore` | boolean | Auto-complete missed repeating instances |
| `repeatingRule` | object | Daily/Weekly/Monthly/Yearly recurrence |

### Urgency Color System

| Color | Meaning | Engine Behavior |
|-------|---------|-----------------|
| 🟢 Green | Normal scheduling | Standard placement |
| 🟠 Orange | Dangerously close to deadline | Bypasses balanced distribution, front-loads aggressively |
| 🔴 Red | Overdue or missing deadline | Scheduled first, past-deadline placement allowed |

---

## Features

### Core Scheduling
- [x] Autonomous task placement with constraint satisfaction
- [x] Balanced and Front-Load distribution models
- [x] Task splitting with minimum block duration
- [x] Task dependencies with circular dependency detection
- [x] Multiple scheduling hours profiles (temporal masks)
- [x] Event buffers (before/after)
- [x] Urgency color coding (Green/Orange/Red)
- [x] Priority supersedes deadline conflict resolution
- [x] Progress tracking (Duration - Progress = remaining work)
- [x] Auto-scheduling cutoff with visual gray stripes

### Task Management
- [x] Quick-capture Inbox with bi-directional state transition
- [x] List-based organization with inherited defaults (color, scheduling hours)
- [x] Repeating tasks (Daily/Weekly/Biweekly/Monthly/Yearly/Custom)
- [x] Auto-Ignore for missed repeating task instances
- [x] Missed Deadlines Resolution Center
- [x] Multi-select toolbar with bulk operations
- [x] Floating modal task/event editor (no calendar squish)
- [x] Discard Changes confirmation modal

### Calendar
- [x] Day / 3-Day / Week views
- [x] Drag-and-drop task rescheduling
- [x] All-day event row
- [x] Now-line indicator
- [x] Double-click to create task/event at specific time
- [x] Cutoff zone visualization (gray stripes)

### UI/UX
- [x] Nord theme (dark + light modes)
- [x] Terminal/monospace aesthetic (JetBrains Mono)
- [x] Custom frameless window with title bar controls
- [x] Command palette (Ctrl+K)
- [x] Keyboard shortcuts (Escape, Delete, navigation)
- [x] Responsive mobile layout with hamburger menu
- [x] PWA support (installable on mobile browsers)

### Sync & Storage
- [x] Dual persistence: localStorage (fast) + IndexedDB (durable)
- [x] LAN sync server with PIN authentication
- [x] Supabase cloud sync (sign up / sign in / auto-push / auto-pull)
- [x] Data export and import

### Cross-Platform
- [x] Linux desktop (.deb, AppImage)
- [x] Windows desktop (NSIS installer)
- [x] Web browser (PWA)
- [x] Mobile browser (responsive)
- [x] Android WebView APK

---

## Project Structure

```
Muse/
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Context bridge (IPC)
│   └── syncServer.js        # LAN sync HTTP server
├── src/
│   ├── engine/
│   │   ├── scheduler.ts     # Constraint-satisfaction scheduling algorithm
│   │   ├── repeating.ts     # Repeating task/event instance generator
│   │   └── dependencies.ts  # Dependency graph + cycle detection (DFS)
│   ├── components/
│   │   ├── CalendarView.tsx  # Main calendar grid (Day/3D/Week)
│   │   ├── Sidebar.tsx       # Navigation sidebar with lists
│   │   ├── InboxView.tsx     # Quick-capture inbox
│   │   ├── TaskListView.tsx  # Task list per category
│   │   ├── MissedDeadlinesView.tsx  # Overdue task resolution
│   │   ├── FloatingTaskModal.tsx    # Task editor modal
│   │   ├── FloatingEventModal.tsx   # Event editor modal
│   │   ├── SettingsModal.tsx        # Full settings panel
│   │   ├── CommandPalette.tsx       # Ctrl+K command palette
│   │   ├── TitleBar.tsx      # Custom frameless title bar
│   │   ├── PhoneHeader.tsx   # Mobile header with hamburger
│   │   ├── AuthScreen.tsx    # Cloud auth (sign in/up)
│   │   ├── PinGate.tsx       # LAN sync PIN authentication
│   │   ├── RecalculateButton.tsx    # Schedule rebuild trigger
│   │   └── DiscardChangesModal.tsx  # Unsaved changes guard
│   ├── store/
│   │   └── useMuseStore.ts   # Zustand store (state + actions)
│   ├── hooks/
│   │   ├── useCloudSync.ts   # Supabase auto-push/pull
│   │   ├── useSyncEngine.ts  # LAN sync polling
│   │   └── useNotificationScheduler.ts  # Browser notifications
│   ├── utils/
│   │   ├── cloudSync.ts      # Supabase auth + CRUD helpers
│   │   ├── supabase.ts       # Supabase client initialization
│   │   ├── storage.ts        # localStorage + IndexedDB persistence
│   │   ├── syncClient.ts     # LAN sync HTTP client
│   │   └── dateUtils.ts      # Date formatting utilities
│   ├── types/
│   │   └── index.ts          # Complete TypeScript type system
│   ├── App.tsx               # Root component
│   ├── main.tsx              # React entry point
│   └── index.css             # Nord theme CSS variables + global styles
├── supabase/
│   └── schema.sql            # Database schema (run in Supabase SQL Editor)
├── public/                   # Static assets (icons, manifest)
├── android/                  # Android WebView APK project
├── .env.example              # Environment variable template
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/siddhantharsh/Muse.git
cd Muse

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Development

```bash
# Start Vite dev server (web only)
npm run dev

# Start Electron + Vite together
npm run electron:dev
```

### Production Build

```bash
# Build the web app
npm run build

# Build Linux desktop (.deb + AppImage)
npm run electron:build

# Build Windows desktop (NSIS installer)
npm run electron:build:win
```

---

## Cloud Sync Setup (Optional)

Muse supports cloud sync via [Supabase](https://supabase.com) for cross-device data synchronization.

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open **SQL Editor** in the dashboard
3. Run the contents of `supabase/schema.sql`

### 2. Configure Environment Variables

```bash
# Edit .env with your project details
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Get these from: **Supabase Dashboard → Settings → API**

### 3. Enable Email Auth

In Supabase Dashboard → Authentication → Providers, ensure **Email** is enabled.

### 4. Sign In

Open Muse → Settings → Cloud Account → Sign In with your email and password.

---

## LAN Sync (Desktop → Phone)

The desktop app runs a built-in HTTP server for local network access:

1. Open Muse desktop → Settings → Sync
2. Note the **LAN URL** and **PIN** displayed
3. On your phone, open the URL in a browser
4. Enter the PIN to authenticate

> **Note:** LAN sync requires both devices on the same network. For cross-network sync, use Cloud Sync instead.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open command palette |
| `Escape` | Close any popup/modal |
| `Delete` / `Backspace` | Delete selected task/event |

---

## Design Philosophy

### Why Not an LLM?

The FlowSavvy PRD explicitly notes that generalized LLM interfaces "suffer from hallucinations and struggle with the immense number of constraints required to map several weeks of tasks." Muse uses a **dedicated, deterministic scheduling algorithm** — no AI randomness, no API costs, no latency. The same inputs always produce the same schedule.

### Why Nord Theme?

The interface deliberately adopts a **terminal/monospace aesthetic** with the Nord color palette. Zero border-radius, JetBrains Mono font, minimal visual noise. The calendar grid lines are intentionally subtle — the focus is on your tasks, not the grid.

### Why Floating Modals?

Legacy calendar apps force the calendar to compress when a detail pane opens (the "calendar squish" problem). Muse uses **floating, draggable windows** that overlay the calendar without reflowing it, preserving spatial context.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT

---

<p align="center">
  <sub>Built with obsessive attention to scheduling correctness.</sub>
</p>
