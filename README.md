# Resource Planner

A Python/Flask web application for project resource planning with an interactive Gantt chart.

## Features

### Gantt Chart
- Canvas-rendered task bars with color coding
- Five zoom levels: Day, 3-Day, Week, 2-Week, Month
- Today marker (red vertical line)
- Grid lines for time orientation
- Horizontal scrolling with synced header and sidebar

### Tasks
- Create, edit, and delete tasks via modal dialogs
- Fields: name, description, start date, end date, progress (%), color
- Drag to move tasks on the chart
- Drag bar edges to resize (change start/end dates)
- Parent/child task grouping (child tasks indent in the sidebar)
- Click a sidebar row to edit, right-click for context menu

### Resources
- Create, edit, and delete resources (people/roles)
- Fields: name, role, color
- Assign resources to tasks; task bars inherit the resource color unless overridden
- Resource names shown in the sidebar alongside each task

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

### Demo Data
- Click "Load Demo Data" in the header to populate a sample project with 3 resources, 5 tasks, and 5 dependencies

## Quick Start

```bash
cd resource-planner
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 in your browser.

## Project Structure

```
resource-planner/
  app.py              Flask application and REST API routes
  models.py           SQLAlchemy models (Task, Resource, Dependency)
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

### Tasks

| Method | Endpoint           | Description         |
|--------|--------------------|---------------------|
| GET    | `/api/tasks`       | List all tasks      |
| POST   | `/api/tasks`       | Create a task       |
| PUT    | `/api/tasks/<id>`  | Update a task       |
| DELETE | `/api/tasks/<id>`  | Delete a task       |

**Task fields:** `name` (string, required), `description` (string), `start_date` (ISO date, required), `end_date` (ISO date, required), `progress` (int 0-100), `resource_id` (int or null), `color` (hex string), `sort_order` (int), `parent_id` (int or null)

### Resources

| Method | Endpoint               | Description          |
|--------|------------------------|----------------------|
| GET    | `/api/resources`       | List all resources   |
| POST   | `/api/resources`       | Create a resource    |
| PUT    | `/api/resources/<id>`  | Update a resource    |
| DELETE | `/api/resources/<id>`  | Delete a resource    |

**Resource fields:** `name` (string, required), `role` (string), `color` (hex string)

### Dependencies

| Method | Endpoint                  | Description            |
|--------|---------------------------|------------------------|
| GET    | `/api/dependencies`       | List all dependencies  |
| POST   | `/api/dependencies`       | Create a dependency    |
| DELETE | `/api/dependencies/<id>`  | Delete a dependency    |

**Dependency fields:** `predecessor_id` (int, required), `successor_id` (int, required), `dep_type` (string: FS/SS/FF/SF, default FS), `lag` (int, days, default 0)

### Seed

| Method | Endpoint     | Description               |
|--------|--------------|---------------------------|
| POST   | `/api/seed`  | Populate demo data        |

## Requirements

- Python 3.10+
- Flask 3.0+
- Flask-SQLAlchemy 3.1+
