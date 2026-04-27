# Resource Planner

A Python/Flask web application for multi-project resource planning with an interactive Gantt chart.

## Features

### Gantt Chart
- Canvas-rendered task bars with color coding
- Five zoom levels: Day, 3-Day, Week, 2-Week, Month
- Today marker (red vertical line)
- Grid lines for time orientation
- Horizontal scrolling with synced header and sidebar
- Resize handles appear on bar edges when hovered, with cursor change to indicate drag affordance
- Drag bar edges to resize (change start/end dates), drag body to move

### Projects
- Create, edit, and delete projects
- Project selector dropdown in the header to filter the Gantt view to a single project
- "All Projects" view to see everything at once
- Edit button appears next to the selector when a project is active
- Deleting a project removes all its tasks and dependencies
- Demo data seeds two sample projects: "Website Redesign" and "Mobile App"

### Tasks
- Create, edit, and delete tasks via modal dialogs
- Fields: name, description, start date, end date, progress (%), color, project, parent task
- Drag to move tasks on the chart
- Drag bar edges to resize (change start/end dates)
- Parent/child task grouping (child tasks indent in the sidebar)
- Click a sidebar row to edit, right-click for context menu
- New tasks default to the currently selected project

### Resources
- "Resources" button in the header opens a list view of all resources
- Each resource shows its color, name, and role with inline edit and delete buttons
- Create new resources from the list view via "+ Add Resource"
- Fields: name, role, color
- Assign resources to tasks; task bars inherit the resource color unless overridden
- Resources are shared across all projects

### Dependencies
- Link tasks with dependency arrows (drawn as SVG curves)
- Four dependency types:
  - **FS** (Finish-to-Start) — successor starts after predecessor finishes
  - **SS** (Start-to-Start) — both start together
  - **FF** (Finish-to-Finish) — both finish together
  - **SF** (Start-to-Finish) — successor finishes when predecessor starts
- Configurable lag (days) on each dependency
- Add dependencies via right-click context menu on any task
- Duplicate and self-referencing dependencies are rejected
- Dependencies are filtered with the project view

### Color Picker
- All color inputs (tasks, resources, projects) include a palette of 20 preset swatches
- Recently used colors (up to 8) are shown below the presets, persisted in browser localStorage
- Click any swatch to select it; the active color is highlighted with a white border
- The native color picker is still available for custom colors

### Settings
- Gear icon in the header opens a settings modal
- Editable parameters: application name, host, port, debug mode, database URI
- The application name controls the header title and browser tab title, and takes effect immediately
- Settings are persisted to `config.json`; host, port, and database URI changes require a server restart

### Demo Data
- Click "Load Demo Data" in the header to populate two sample projects with resources, tasks, and dependencies

## Quick Start

```bash
cd resource-planner
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 in your browser.

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
  models.py           SQLAlchemy models (Project, Task, Resource, Dependency)
  config.json         Server and database configuration
  requirements.txt    Python dependencies
  templates/
    index.html        Single-page web UI
  static/
    css/style.css     Dark-themed styling
    js/app.js         Gantt chart rendering, drag handling, UI logic
  instance/
    planner.db        SQLite database (created on first run)
```

## Data Storage

All data is stored in a local SQLite database at `instance/planner.db`. The database and tables are created automatically on first startup. Delete this file to reset all data.

## REST API

All endpoints accept and return JSON.

### Projects

| Method | Endpoint              | Description          |
|--------|-----------------------|----------------------|
| GET    | `/api/projects`       | List all projects    |
| POST   | `/api/projects`       | Create a project     |
| PUT    | `/api/projects/<id>`  | Update a project     |
| DELETE | `/api/projects/<id>`  | Delete a project     |

**Project fields:** `name` (string, required), `description` (string), `color` (hex string)

### Tasks

| Method | Endpoint           | Description                    |
|--------|--------------------|--------------------------------|
| GET    | `/api/tasks`       | List tasks (optionally filter) |
| POST   | `/api/tasks`       | Create a task                  |
| PUT    | `/api/tasks/<id>`  | Update a task                  |
| DELETE | `/api/tasks/<id>`  | Delete a task                  |

**Query parameters:** `project_id` (int, optional) — filter tasks by project

**Task fields:** `name` (string, required), `description` (string), `start_date` (ISO date, required), `end_date` (ISO date, required), `progress` (int 0-100), `resource_id` (int or null), `color` (hex string), `sort_order` (int), `parent_id` (int or null), `project_id` (int or null)

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
