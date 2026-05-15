# Resource Planner

A Python/Flask web application for multi-project resource planning with an interactive Gantt chart, drag-and-drop dependency linking, and utilization-based workload tracking.

## Features

### Gantt Chart (Task View)
- Canvas-rendered task bars with color coding
- **Horizontal zoom**: five levels — Day, 3-Day, Week, 2-Week, Month
- **Vertical zoom**: five row sizes — XS, S, M (default), L, XL — bar height, font, and row spacing all scale together
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
- **Per-assignment bars** — if a resource has multiple roles on the same task (e.g., PM and IC), each assignment renders as a separate bar with the role in the label (e.g., "Task Name [PM]")
- **Lane stacking** — overlapping assignments are stacked vertically into lanes within the row; row height expands dynamically to fit all lanes at a legible size
- Sidebar displays resource name, **all unique assigned roles** (not just the default), assignment count, and **peak utilization %**
- **Click a resource row** in the sidebar to open the edit resource modal directly
- **Overload detection** based on summed allocation percentages per day (not simple overlap)
  - Two tasks at 50% each = 100% utilization = no overload
  - Two tasks at 80% each = 160% = overloaded
- Overloaded date ranges are highlighted with a red overlay on the chart, showing peak % labels
- Resources exceeding 100% utilization are flagged red in the sidebar

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
- **Export** — download any project as a self-contained JSON file (includes tasks, resources, assignments, dependencies with relative references)
- **Import** — upload a previously exported JSON file to recreate a project; existing resources are matched by name to avoid duplicates
- Demo data seeds two sample projects: "Website Redesign" and "Mobile App"

### Tasks
- Create, edit, and delete tasks via modal dialogs
- Fields: name, description, start date, end date, progress (%), color, project, parent task
- **Multi-resource assignment** — assign multiple resources to a single task via checkboxes
- **Allocation %** per resource-task assignment (1-100%), configurable in the task modal
  - e.g., assign a PM at 10% and an engineer at 80% on the same task
  - Allocations below 100% are shown in the sidebar: "Alice (80%), Bob (30%)"
- Drag to move tasks on the chart
- Drag bar edges to resize (change start/end dates)
- Parent/child task grouping (child tasks indent in the sidebar)
- Click a sidebar row to edit, right-click for context menu
- New tasks default to the currently selected project

### Resources
- "Resources" button in the header opens a list view of all resources
- Each resource shows its color, name, and role with inline edit and delete buttons
- **Multi-select with checkboxes** and **Select All / Deselect All** for batch deletion
- Create new resources from the list view via "+ Add Resource"
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
- **Schedule enforcement** — when a dependency is created, the successor task automatically shifts forward to satisfy the constraint while preserving its duration
- Dependencies are filtered with the project view

### Color Picker
- All color inputs (tasks, resources, projects) include a palette of 20 preset swatches
- Recently used colors (up to 8) are shown below the presets, persisted in browser localStorage
- Click any swatch to select it; the active color is highlighted with a white border
- The native color picker is still available for custom colors

### Export PNG
- Click "Export PNG" in the header to download the current Gantt view as a PNG image
- Composites sidebar (columns, header, rows), date header, task bars, dependency arrows, and overlays into a single image
- Chart is clipped to the last task bar plus a small margin — no wasted empty space on the right
- Works in both Tasks and Resources views, and respects sidebar collapsed/expanded state
- Useful for embedding in Confluence pages, slide decks, or sharing via email

### Themes
- Three built-in themes:
  - **Midnight** — deep navy blue (default, original theme)
  - **Dark** — neutral dark gray, VS Code-inspired
  - **Light** — clean white/light gray for bright environments
- **Theme manager** (palette icon in header) — browse all themes, see color previews, apply with one click
- **Create custom themes** — name your theme and pick colors for all 8 CSS variables (background, surface, surface2, border, text, text dim, accent, danger)
- **Edit and delete** custom themes; built-in themes can be duplicated as a starting point
- Live color preview bar in the editor shows all 8 colors as you adjust them
- Light/dark mode is auto-detected from the background color brightness, so custom themes with light backgrounds automatically get light-mode UI adjustments
- All UI elements adapt: sidebar, modals, chart grid, dependency arrows, today marker, connectors, overload highlights, scrollbars
- Canvas-drawn elements (bar labels, resize handles, connector circles) also adapt to the current theme
- Theme choice and custom themes are persisted to localStorage

### UI State Persistence
- All UI preferences are saved to browser localStorage and restored on page load:
  - Horizontal zoom level
  - Vertical zoom level
  - View mode (Tasks / Resources)
  - Selected project filter
  - Sidebar collapsed state
  - Sidebar width
  - Theme

### Settings
- Gear icon in the header opens a settings modal
- Editable parameters: application name, host, port, debug mode, database URI
- The application name controls the header title and browser tab title, and takes effect immediately
- **Load Demo Data** button is available in the settings modal to populate sample projects
- Settings are persisted to `config.json`; host, port, and database URI changes require a server restart

### Demo Data
- Click "Load Demo Data" in the settings modal to populate two sample projects with resources, tasks, dependencies, and realistic allocation percentages
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

## Configuration

Server settings are stored in `config.json` in the project root:

```json
{
  "host": "127.0.0.1",
  "port": 5000,
  "debug": true,
  "database_uri": "sqlite:///planner.db",
  "secret_key": "change-me-in-production",
  "app_name": "Resource Planner"
}
```

| Key            | Description                                      | Restart required |
|----------------|--------------------------------------------------|------------------|
| `app_name`     | Application name shown in header and browser tab | No               |
| `host`         | Server bind address                              | Yes              |
| `port`         | Server port                                      | Yes              |
| `debug`        | Flask debug mode                                 | Yes              |
| `database_uri` | SQLAlchemy database connection string            | Yes              |
| `secret_key`   | Flask secret key (not exposed via API)           | Yes              |

Edit this file directly, or use the settings modal in the web UI (gear icon). Changes to host, port, and database URI require a server restart.

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
