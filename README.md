# Resource Planner

A Python/Flask web application for multi-project resource planning with an interactive Gantt chart, drag-and-drop dependency linking, and utilization-based workload tracking.

## Features

### Gantt Chart (Task View)
- Canvas-rendered task bars with color coding
- **Horizontal zoom**: five levels — Day, 3-Day, Week, 2-Week, Month
- **Vertical zoom**: six row sizes — XS, S, M (default), L, XL, XXL — bar height, font, and row spacing all scale together
- **Font size**: five levels — XS, S, M (default), L, XL — scales all UI text globally (sidebar, headers, modals, buttons, documentation) independently of row height
- Today marker (red vertical line)
- Grid lines for time orientation
- Horizontal scrolling with synced header and sidebar
- Resize handles appear on bar edges when hovered, with cursor change to indicate drag affordance
- Drag bar edges to resize (change start/end dates), drag body to move
- **Timeline auto-expands** when dragging a bar beyond the visible date range
- Resource dots rendered on task bars; when the sidebar is collapsed, bar labels include resource names (e.g. "Backend dev — Alice, Bob")

### Drag-and-Drop Dependency Linking
- **Connector circles** appear at the left (start) and right (end) of each task bar on hover
- Cursor changes to **crosshair** when hovering over a connector
- **Click and drag** from a connector to another task bar to create a dependency
- A **dashed arrow** follows the mouse during the drag; the target bar highlights with a white border
- **Dependency type is determined automatically** based on which connectors are used:
  - Right → Left = Finish-to-Start (FS)
  - Left → Left = Start-to-Start (SS)
  - Right → Right = Finish-to-Finish (FF)
  - Left → Right = Start-to-Finish (SF)
- Release on empty space cancels; self-links and duplicates are rejected
- Dependencies can also be created via right-click context menu or the dependency modal

### Resource Timeline View
- Toggle between **Tasks** and **Resources** views via buttons in the header
- Resource view shows one row per resource with all their assigned task bars
- **Project filtering** — when a specific project is selected, only resources with assignments in that project are shown; "All Projects" shows all resources
- **Per-assignment bars** — if a resource has multiple roles on the same task (e.g., PM and IC), each assignment renders as a separate bar with role and allocation in the label (e.g., "Task Name (PM | 10%)")
- **Lane stacking** — overlapping assignments are stacked vertically into lanes within the row; row height expands dynamically to fit all lanes at a legible size
- Sidebar displays resource name, **all unique assigned roles** (not just the default), assignment count, and **peak utilization %**
- **Click a resource row** in the sidebar to open the edit resource modal directly
- **Overload detection** based on summed allocation percentages per day (not simple overlap)
  - Two tasks at 50% each = 100% utilization = no overload
  - Two tasks at 80% each = 160% = overloaded
- Overloaded date ranges are highlighted with a red overlay on the chart, showing peak % labels
- Resources exceeding 100% utilization are flagged red in the sidebar
- **Utilization sparkline** — a step chart at the bottom of each resource row visualizes total allocation over time
  - Reference lines at 50% and 100% provide scale
  - Per-segment percentage labels are drawn on the chart
  - Gaps between assignments step cleanly to zero (no diagonal ramps)
  - Segments exceeding 100% are highlighted in the danger color
  - **Hover tooltip** — mouse over the sparkline area to see the exact utilization percentage for any day
- **Drag to reorder** — drag resource rows vertically to reorder; sort order is persisted to the database

### Sidebar Panel
- **Collapsible** — toggle button (arrow) hides/shows the sidebar; when collapsed, task bars display resource names inline
- **Resizable width** — drag the handle between the sidebar and chart to adjust (min 120px, max 70% of window); columns reflow dynamically as width changes
- **Resizable columns** — drag column header borders to adjust individual column widths; the last column always flexes to fill remaining space
- Column widths reset when switching between Tasks and Resources views
- **Cross-panel row highlighting** — hovering a sidebar row or chart row highlights the full row across both panels with a subtle accent band

### Projects
- Create, edit, and delete projects
- **Project list modal** — hamburger icon next to the project selector opens a list of all projects with task counts
- **Multi-select with checkboxes** and **Select All / Deselect All** for batch deletion
- Project selector dropdown in the header to filter the Gantt view to a single project
- "All Projects" view to see everything at once
- Deleting a project removes all its tasks, assignments, and dependencies
- **Export** — download any project as a self-contained JSON file (includes tasks, resources, assignments, dependencies with relative references); available via the header icon (↓) when a project is selected, or per-project in the manage modal
- **Import** — upload a previously exported JSON file to recreate a project; available via the header icon (↑) or from the manage modal; existing resources are matched by name to avoid duplicates
- Demo data seeds two sample projects: "Website Redesign" and "Mobile App"

### Tasks
- Create, edit, and delete tasks via modal dialogs
- Fields: name, description, start date, end date, progress (%), color, project, parent task
- **Multi-resource assignment** — assign multiple resources to a single task via checkboxes
- **Allocation %** per resource-task assignment (1-100%), configurable in the task modal
  - e.g., assign a PM at 10% and an engineer at 80% on the same task
  - Allocations below 100% are shown in the sidebar: "Alice (80%), Bob (30%)"
- **Unstaffed indicator** — tasks with no resources assigned render with diagonal hatching and a dashed red border to stand out
- Drag to move tasks on the chart
- Drag bar edges to resize (change start/end dates)
- **Drag to reorder** — drag sidebar rows vertically to reorder tasks; ghost row and drop indicator show the target position
- Parent/child task grouping (child tasks indent in the sidebar)
- Click a sidebar row to edit, right-click for context menu
- New tasks default to the currently selected project

### Resources
- "Resources" button in the header opens a list view of all resources
- Each resource shows its color, name, and role with inline edit and delete buttons
- **Multi-select with checkboxes** and **Select All / Deselect All** for batch deletion
- Create new resources from the list view via "+ Add Resource"
- **Drag to reorder** — drag resource rows vertically in the Resources view to reorder; order is persisted
- Fields: name, role, color
- Assign resources to tasks; task bars inherit the first resource's color unless overridden
- Resources are shared across all projects

### Dependencies
- Link tasks with dependency arrows (drawn as SVG curves)
- Four dependency types:
  - **FS** (Finish-to-Start) — successor starts after predecessor finishes
  - **SS** (Start-to-Start) — both start together
  - **FF** (Finish-to-Finish) — both finish together
  - **SF** (Start-to-Finish) — successor finishes when predecessor starts
- Configurable lag (days) on each dependency
- Create dependencies by **dragging between task bar connectors**, via right-click context menu, or via the dependency modal
- Duplicate and self-referencing dependencies are rejected
- **Click any dependency arrow** to highlight it (turns red); click to delete with confirmation
- **Schedule enforcement** — dependencies are enforced on creation and on drag:
  - When a dependency is created, the successor shifts forward to satisfy the constraint
  - When a predecessor is moved or resized, successors shift to maintain the constraint
  - Moving/shrinking a predecessor pulls successors back proportionally while preserving intentional gaps
  - Enforcement cascades through the entire dependency chain
- **Date validation** — end date cannot be before start date (enforced in UI and API)
- Dependencies are filtered with the project view

### Color Picker
- All color inputs (tasks, resources, projects) include a palette of 20 preset swatches
- Recently used colors (up to 8) are shown below the presets, persisted in browser localStorage
- Click any swatch to select it; the active color is highlighted with a white border
- The native color picker is still available for custom colors

### Export (PNG / PDF)
- Click **Export** in the header to open the export modal with PNG and PDF options
- **Timestamped filenames** — all exports (PNG, PDF, and project JSON) include the project name, view mode, and date/time (e.g. `export-staffing-tasks-20260518-1430.png`)
- Composites sidebar (columns, header, rows), date header, task bars, dependency arrows, and overlays into a single image
- **2x resolution rendering** — all text, bars, and lines are re-rendered at high DPI for crisp output
- **Alternating row stripes** — odd rows have a subtle background tint for easier visual tracking in exported images
- Sidebar columns are widened in export (min 120px task, 160px resource) to prevent truncation
- **Variable row heights** — resource view exports correctly render rows with different heights from lane stacking
- **"Show resource names on bars"** checkbox — overlays resource names on bars even when the sidebar is visible
- Chart is clipped to the last task bar plus a small margin — no wasted empty space on the right
- PDF pages are sized to content (no scaling down to fit A4), so text is readable at 100% zoom
- Works in both Tasks and Resources views
- Useful for embedding in Confluence pages, slide decks, or sharing via email

### Themes
- Four built-in themes:
  - **Midnight** — deep navy blue (default, original theme)
  - **Dark** — neutral dark gray, VS Code-inspired
  - **Light** — clean white/light gray for bright environments
  - **Warm Light** — cream/warm tones with orange accent
- **Theme manager** (palette icon in header) — browse all themes, see color previews, apply with one click
- **Create custom themes** — name your theme and pick colors for all 8 CSS variables (background, surface, surface2, border, text, text dim, accent, danger)
- **Edit and delete** custom themes; built-in themes can be duplicated as a starting point
- Live color preview bar in the editor shows all 8 colors as you adjust them
- Light/dark mode is auto-detected from the background color brightness, so custom themes with light backgrounds automatically get light-mode UI adjustments
- All UI elements adapt: sidebar, modals, chart grid, dependency arrows, today marker, connectors, overload highlights, scrollbars
- Canvas-drawn elements (bar labels, resize handles, connector circles) also adapt to the current theme
- Theme choice and custom themes are persisted to localStorage
- **Export / Import themes** — share custom themes between browsers or team members via JSON files from the theme manager

### Undo / Redo
- **Ctrl+Z** to undo, **Ctrl+Y** or **Ctrl+Shift+Z** to redo (Cmd on Mac)
- **Undo/Redo buttons** in the header for mouse-driven workflows
- Supports: drag move/resize, task edit, task create, task delete, dependency create, dependency delete, task reorder
- Undo restores previous state via API calls; redo re-applies the action
- Undo stack holds up to 50 actions; redo stack clears on any new action
- Dependency undo also reverses any schedule shift that was applied to the successor task

### UI State Persistence
- All UI preferences are saved to browser localStorage and restored on page load:
  - Horizontal zoom level
  - Vertical zoom level
  - Font size level
  - View mode (Tasks / Resources)
  - Selected project filter
  - Sidebar collapsed state
  - Sidebar width
  - Theme

### Settings
- Gear icon in the header opens a settings modal
- Editable parameters: application name, version, host, port, debug mode, database URI
- The application name and version control the header title and browser tab (displayed as "Name Version"), and take effect immediately
- `APP_NAME` and `APP_VERSION` environment variables override config.json values (useful for Docker deployments)
- **Load Demo Data** button is available in the settings modal to populate sample projects
- **Reset All Data** — clears all projects, tasks, resources, and dependencies with double confirmation
- Settings are persisted to `config.json`; host, port, and database URI changes require a server restart

### In-App Documentation
- **Getting Started** (? icon) — quick-reference modal covering core workflows and keyboard shortcuts
- **Documentation** (page icon) — renders the full README inside the app as formatted HTML with styled headings, tables, code blocks, and lists
- Both modals scale with the font size setting

### Demo Data
- Click "Load Demo Data" in the settings modal to populate two sample projects with resources, tasks, dependencies, and realistic allocation percentages
- Can be loaded at any time, even when other projects already exist — existing resources are reused by name to avoid duplicates
- Includes examples of partial allocations (PM at 10%, engineer at 80%) and overloaded resources

## Quick Start

```bash
cd resource-planner
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 in your browser.

## Docker

Build and run with Docker Compose:

```bash
cd resource-planner
docker compose up --build
```

Open http://localhost:5000 in your browser.

The SQLite database is stored in a named volume (`planner-data`) so data persists across container restarts. `config.json` is bind-mounted from the host for easy editing.

To run in the background:

```bash
docker compose up -d --build
```

To stop:

```bash
docker compose down
```

### Versioning

The Docker image includes version and build date labels. The version is set in `docker-compose.yml` under `build.args.VERSION` (currently `0.4`). The build date is injected automatically when passing the build arg:

```bash
docker compose build --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

Inspect labels with:

```bash
docker inspect resource-planner:0.4 --format '{{json .Config.Labels}}'
```

### Environment Variables

The following environment variables override `config.json` values at runtime:

| Variable      | Description                             | Default            |
|---------------|-----------------------------------------|--------------------|
| `APP_NAME`    | Application name shown in header/title  | From config.json   |
| `APP_VERSION` | Version shown next to the app name      | Build-arg VERSION  |

Set these in `docker-compose.yml` under `environment:`, or when creating a container in Container Station / Portainer.

### Saving and Loading Images

Save the image to a portable tar file:

```bash
docker save resource-planner:0.4 -o resource-planner-v0.4.tar
```

Load it on another machine:

```bash
docker load -i resource-planner-v0.4.tar
```

### QNAP Container Station

Docker Desktop with BuildKit enabled produces OCI-format images that Container Station cannot import. To build a compatible image, disable BuildKit in Docker Desktop (Settings → Docker Engine → set `"buildkit": false`), then build and save:

```bash
docker build -t resource-planner:0.4 .
docker save resource-planner:0.4 -o resource-planner-v0.4.tar
```

Import the `.tar` file in Container Station under **Images → Import**. When creating the container, set:
- Port mapping: host `5000` → container `5000`
- Volume: bind a folder to `/app/instance` for database persistence
- Environment variables: `APP_NAME` and `APP_VERSION` as desired

## Configuration

Server settings are stored in `config.json` in the project root:

```json
{
  "host": "127.0.0.1",
  "port": 5000,
  "debug": true,
  "database_uri": "sqlite:///planner.db",
  "secret_key": "change-me-in-production",
  "app_name": "Resource Planner",
  "app_version": "0.4"
}
```

| Key            | Description                                         | Restart required |
|----------------|-----------------------------------------------------|------------------|
| `app_name`     | Application name shown in header and browser tab    | No               |
| `app_version`  | Version shown next to the name (e.g. "0.4")         | No               |
| `host`         | Server bind address                                 | Yes              |
| `port`         | Server port                                         | Yes              |
| `debug`        | Flask debug mode                                    | Yes              |
| `database_uri` | SQLAlchemy database connection string               | Yes              |
| `secret_key`   | Flask secret key (not exposed via API)              | Yes              |

Edit this file directly, or use the settings modal in the web UI (gear icon). Changes to host, port, and database URI require a server restart. `app_name` and `app_version` can also be overridden via environment variables (`APP_NAME`, `APP_VERSION`).

## Project Structure

```
resource-planner/
  app.py              Flask application and REST API routes
  models.py           SQLAlchemy models (Project, Task, TaskResource, Resource, Dependency)
  config.json         Server and database configuration
  requirements.txt    Python dependencies
  Dockerfile          Container image definition
  docker-compose.yml  Docker Compose service configuration
  .dockerignore       Files excluded from Docker build context
  templates/
    index.html        Single-page web UI
  static/
    css/style.css     Themed styling (supports custom themes)
    js/app.js         Gantt chart rendering, drag handling, dependency linking, UI logic
  instance/
    planner.db        SQLite database (created on first run)
```

## Data Model

### Task-Resource Assignments

Tasks and resources have a many-to-many relationship through the `TaskResource` join table, which includes an `allocation` percentage:

```
Task ──< TaskResource >── Resource
           allocation (1-100%)
```

This allows a single resource to be assigned to multiple concurrent tasks at different utilization levels. The resource timeline view sums allocations per day and flags any period where a resource exceeds 100% total utilization.

### Dependencies

Dependencies link two tasks with a type (FS/SS/FF/SF) and optional lag in days:

```
Task (predecessor) ──> Dependency ──> Task (successor)
                        dep_type
                        lag (days)
```

## Data Storage

All data is stored in a local SQLite database at `instance/planner.db`. The database and tables are created automatically on first startup. Delete this file to reset all data.

UI preferences (zoom levels, sidebar state, selected project) are stored in browser localStorage and do not require the server.

## REST API

All endpoints accept and return JSON.

### Projects

| Method | Endpoint                      | Description                      |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/projects`               | List all projects                |
| POST   | `/api/projects`               | Create a project                 |
| PUT    | `/api/projects/<id>`          | Update a project                 |
| DELETE | `/api/projects/<id>`          | Delete a project                 |
| GET    | `/api/projects/<id>/export`   | Export project as JSON bundle    |
| POST   | `/api/projects/import`        | Import project from JSON bundle  |

**Project fields:** `name` (string, required), `description` (string), `color` (hex string)

**Export format:** JSON object with `version`, `project`, `resources`, `tasks`, `assignments`, `dependencies` — all references use local indices rather than database IDs, making the file portable.

**Import behavior:** Creates the project and its tasks. Resources are matched by name — if a resource with the same name already exists, it is reused rather than duplicated.

### Tasks

| Method | Endpoint           | Description                    |
|--------|--------------------|--------------------------------|
| GET    | `/api/tasks`       | List tasks (optionally filter) |
| POST   | `/api/tasks`       | Create a task                  |
| PUT    | `/api/tasks/<id>`  | Update a task                  |
| DELETE | `/api/tasks/<id>`  | Delete a task                  |

**Query parameters:** `project_id` (int, optional) — filter tasks by project

**Task fields:** `name` (string, required), `description` (string), `start_date` (ISO date, required), `end_date` (ISO date, required), `progress` (int 0-100), `resource_ids` (array, see below), `color` (hex string), `sort_order` (int), `parent_id` (int or null), `project_id` (int or null)

**Resource assignment format** (`resource_ids`):
- Array of integers for 100% allocation: `[1, 2, 3]`
- Array of objects for custom allocation: `[{"id": 1, "allocation": 80}, {"id": 2, "allocation": 30}]`

**Task response** includes:
- `resource_ids`: array of assigned resource IDs
- `resources`: array of `{id, name, color, allocation}` objects
- `resource_name`: formatted string, e.g. `"Alice (80%), Bob (30%)"`

### Resources

| Method | Endpoint               | Description          |
|--------|------------------------|----------------------|
| GET    | `/api/resources`       | List all resources   |
| POST   | `/api/resources`       | Create a resource    |
| PUT    | `/api/resources/<id>`  | Update a resource    |
| DELETE | `/api/resources/<id>`  | Delete a resource    |

**Resource fields:** `name` (string, required), `role` (string), `color` (hex string)

### Dependencies

| Method | Endpoint                  | Description                          |
|--------|---------------------------|--------------------------------------|
| GET    | `/api/dependencies`       | List dependencies (optionally filter)|
| POST   | `/api/dependencies`       | Create a dependency                  |
| DELETE | `/api/dependencies/<id>`  | Delete a dependency                  |

**Query parameters:** `project_id` (int, optional) — filter to dependencies within a project's tasks

**Dependency fields:** `predecessor_id` (int, required), `successor_id` (int, required), `dep_type` (string: FS/SS/FF/SF, default FS), `lag` (int, days, default 0)

### Configuration

| Method | Endpoint       | Description                  |
|--------|----------------|------------------------------|
| GET    | `/api/config`  | Get current config           |
| PUT    | `/api/config`  | Update config (saves to file)|

### Seed

| Method | Endpoint     | Description               |
|--------|--------------|---------------------------|
| POST   | `/api/seed`  | Populate demo data        |

## Requirements

- Python 3.10+
- Flask 3.0+
- Flask-SQLAlchemy 3.1+
