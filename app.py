from flask import Flask, render_template, request, jsonify
from models import db, Resource, Task, Dependency, Project, TaskResource, BlockedDay
from datetime import date, timedelta
import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def load_config():
    defaults = {
        "host": "127.0.0.1",
        "port": 5000,
        "debug": True,
        "database_uri": "sqlite:///planner.db",
        "secret_key": "change-me-in-production",
        "app_name": "Resource Planner",
        "app_version": "",
    }
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            defaults.update(json.load(f))
    if os.environ.get("APP_NAME"):
        defaults["app_name"] = os.environ["APP_NAME"]
    if os.environ.get("APP_VERSION"):
        defaults["app_version"] = os.environ["APP_VERSION"]
    return defaults

config = load_config()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = config["database_uri"]
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = config["secret_key"]
db.init_app(app)

with app.app_context():
    from sqlalchemy import inspect, text
    try:
        insp = inspect(db.engine)
        # Migrate task_resource: old schema had composite PK (task_id, resource_id), new has surrogate id PK
        if "task_resource" in insp.get_table_names():
            cols = [c["name"] for c in insp.get_columns("task_resource")]
            if "id" not in cols:
                db.session.execute(text("ALTER TABLE task_resource RENAME TO _task_resource_old"))
                db.session.execute(text("""
                    CREATE TABLE task_resource (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        task_id INTEGER NOT NULL REFERENCES task(id),
                        resource_id INTEGER NOT NULL REFERENCES resource(id),
                        allocation INTEGER DEFAULT 100,
                        role VARCHAR(120)
                    )
                """))
                old_cols = [c["name"] for c in insp.get_columns("_task_resource_old")]
                if "role" in old_cols:
                    db.session.execute(text("INSERT INTO task_resource (task_id, resource_id, allocation, role) SELECT task_id, resource_id, allocation, role FROM _task_resource_old"))
                else:
                    db.session.execute(text("INSERT INTO task_resource (task_id, resource_id, allocation) SELECT task_id, resource_id, allocation FROM _task_resource_old"))
                db.session.execute(text("DROP TABLE _task_resource_old"))
                db.session.commit()
            elif "role" not in cols:
                db.session.execute(text("ALTER TABLE task_resource ADD COLUMN role VARCHAR(120)"))
                db.session.commit()
        if "resource" in insp.get_table_names():
            res_cols = [c["name"] for c in insp.get_columns("resource")]
            if "sort_order" not in res_cols:
                db.session.execute(text("ALTER TABLE resource ADD COLUMN sort_order INTEGER DEFAULT 0"))
                db.session.commit()
    except Exception:
        db.session.rollback()
    db.create_all()


# ── Blocked Days ─────────────────────────────────────

@app.route("/api/blocked-days", methods=["GET"])
def get_blocked_days():
    query = BlockedDay.query
    scope = request.args.get("scope")
    resource_id = request.args.get("resource_id", type=int)
    project_id = request.args.get("project_id", type=int)
    if scope:
        query = query.filter_by(scope=scope)
    if resource_id:
        query = query.filter((BlockedDay.resource_id == resource_id) | (BlockedDay.scope == "global"))
    if project_id:
        query = query.filter((BlockedDay.project_id == project_id) | (BlockedDay.scope == "global"))
    return jsonify([bd.to_dict() for bd in query.all()])


@app.route("/api/blocked-days", methods=["POST"])
def create_blocked_day():
    data = request.json
    bd = BlockedDay(
        name=data["name"],
        start_date=date.fromisoformat(data["start_date"]),
        end_date=date.fromisoformat(data["end_date"]),
        scope=data.get("scope", "global"),
        resource_id=data.get("resource_id"),
        project_id=data.get("project_id"),
        color=data.get("color", "#ff6b6b"),
    )
    db.session.add(bd)
    db.session.commit()
    return jsonify(bd.to_dict()), 201


@app.route("/api/blocked-days/<int:bd_id>", methods=["PUT"])
def update_blocked_day(bd_id):
    bd = BlockedDay.query.get_or_404(bd_id)
    data = request.json
    if "name" in data:
        bd.name = data["name"]
    if "start_date" in data:
        bd.start_date = date.fromisoformat(data["start_date"])
    if "end_date" in data:
        bd.end_date = date.fromisoformat(data["end_date"])
    if "scope" in data:
        bd.scope = data["scope"]
    if "resource_id" in data:
        bd.resource_id = data["resource_id"]
    if "project_id" in data:
        bd.project_id = data["project_id"]
    if "color" in data:
        bd.color = data["color"]
    db.session.commit()
    return jsonify(bd.to_dict())


@app.route("/api/blocked-days/<int:bd_id>", methods=["DELETE"])
def delete_blocked_day(bd_id):
    bd = BlockedDay.query.get_or_404(bd_id)
    db.session.delete(bd)
    db.session.commit()
    return "", 204


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/readme")
def get_readme():
    readme_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "README.md")
    if os.path.exists(readme_path):
        with open(readme_path) as f:
            return jsonify({"content": f.read()})
    return jsonify({"content": ""}), 404


@app.route("/api/config", methods=["GET"])
def get_config():
    safe = {k: v for k, v in config.items() if k != "secret_key"}
    return jsonify(safe)


@app.route("/api/config", methods=["PUT"])
def update_config():
    data = request.json
    allowed = {"host", "port", "debug", "database_uri", "app_name", "app_version"}
    for key in data:
        if key in allowed:
            config[key] = data[key]
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
    return jsonify({k: v for k, v in config.items() if k != "secret_key"})


# ── Projects ─────────────────────────────────────────

@app.route("/api/projects", methods=["GET"])
def get_projects():
    return jsonify([p.to_dict() for p in Project.query.order_by(Project.name).all()])


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json
    p = Project(
        name=data["name"],
        description=data.get("description", ""),
        color=data.get("color", "#4a86c8"),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201


@app.route("/api/projects/<int:pid>", methods=["PUT"])
def update_project(pid):
    p = Project.query.get_or_404(pid)
    data = request.json
    p.name = data.get("name", p.name)
    p.description = data.get("description", p.description)
    p.color = data.get("color", p.color)
    db.session.commit()
    return jsonify(p.to_dict())


@app.route("/api/projects/<int:pid>", methods=["DELETE"])
def delete_project(pid):
    p = Project.query.get_or_404(pid)
    proj_tasks = Task.query.filter_by(project_id=pid).all()
    task_ids = [t.id for t in proj_tasks]
    if task_ids:
        Dependency.query.filter(
            (Dependency.predecessor_id.in_(task_ids)) | (Dependency.successor_id.in_(task_ids))
        ).delete(synchronize_session=False)
        TaskResource.query.filter(TaskResource.task_id.in_(task_ids)).delete(synchronize_session=False)
        Task.query.filter_by(project_id=pid).delete()
    BlockedDay.query.filter_by(project_id=pid).delete()
    db.session.delete(p)
    db.session.commit()
    return "", 204


# ── Resources ──────────────────────────────────────────

@app.route("/api/resources", methods=["GET"])
def get_resources():
    return jsonify([r.to_dict() for r in Resource.query.order_by(Resource.sort_order, Resource.name).all()])


@app.route("/api/resources", methods=["POST"])
def create_resource():
    data = request.json
    r = Resource(
        name=data["name"],
        role=data.get("role", ""),
        color=data.get("color", "#4a86c8"),
        sort_order=data.get("sort_order", 0),
    )
    db.session.add(r)
    db.session.commit()
    return jsonify(r.to_dict()), 201


@app.route("/api/resources/<int:rid>", methods=["PUT"])
def update_resource(rid):
    r = Resource.query.get_or_404(rid)
    data = request.json
    r.name = data.get("name", r.name)
    r.role = data.get("role", r.role)
    r.color = data.get("color", r.color)
    if "sort_order" in data:
        r.sort_order = data["sort_order"]
    db.session.commit()
    return jsonify(r.to_dict())


@app.route("/api/resources/<int:rid>", methods=["DELETE"])
def delete_resource(rid):
    TaskResource.query.filter_by(resource_id=rid).delete()
    BlockedDay.query.filter_by(resource_id=rid).delete()
    r = Resource.query.get_or_404(rid)
    db.session.delete(r)
    db.session.commit()
    return "", 204


def _sync_task_resources(t, resource_entries):
    """resource_entries: list of {id, allocation, role} dicts or plain int ids."""
    TaskResource.query.filter_by(task_id=t.id).delete()
    for entry in (resource_entries or []):
        if isinstance(entry, dict):
            rid = entry["id"]
            alloc = entry.get("allocation", 100)
            role = entry.get("role") or None
        else:
            rid = entry
            alloc = 100
            role = None
        db.session.add(TaskResource(task_id=t.id, resource_id=rid, allocation=alloc, role=role))


# ── Tasks ──────────────────────────────────────────────

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    project_id = request.args.get("project_id", type=int)
    q = Task.query
    if project_id:
        q = q.filter_by(project_id=project_id)
    tasks = q.order_by(Task.sort_order, Task.start_date).all()
    return jsonify([t.to_dict() for t in tasks])


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.json
    start = date.fromisoformat(data["start_date"])
    end = date.fromisoformat(data["end_date"])
    if end < start:
        return jsonify({"error": "End date cannot be before start date"}), 400
    t = Task(
        name=data["name"],
        description=data.get("description", ""),
        start_date=start,
        end_date=end,
        progress=data.get("progress", 0),
        color=data.get("color"),
        sort_order=data.get("sort_order", 0),
        parent_id=data.get("parent_id"),
        project_id=data.get("project_id"),
    )
    db.session.add(t)
    db.session.flush()
    _sync_task_resources(t, data.get("resource_ids", []))
    db.session.commit()
    return jsonify(t.to_dict()), 201


@app.route("/api/tasks/<int:tid>", methods=["PUT"])
def update_task(tid):
    t = Task.query.get_or_404(tid)
    data = request.json
    new_start = date.fromisoformat(data["start_date"]) if "start_date" in data else t.start_date
    new_end = date.fromisoformat(data["end_date"]) if "end_date" in data else t.end_date
    if new_end < new_start:
        return jsonify({"error": "End date cannot be before start date"}), 400
    if "name" in data:
        t.name = data["name"]
    if "description" in data:
        t.description = data["description"]
    if "start_date" in data:
        t.start_date = new_start
    if "end_date" in data:
        t.end_date = new_end
    if "progress" in data:
        t.progress = data["progress"]
    if "color" in data:
        t.color = data["color"]
    if "sort_order" in data:
        t.sort_order = data["sort_order"]
    if "parent_id" in data:
        t.parent_id = data["parent_id"]
    if "project_id" in data:
        t.project_id = data["project_id"]
    if "resource_ids" in data:
        _sync_task_resources(t, data["resource_ids"])
    db.session.commit()
    return jsonify(t.to_dict())


@app.route("/api/tasks/<int:tid>", methods=["DELETE"])
def delete_task(tid):
    Dependency.query.filter(
        (Dependency.predecessor_id == tid) | (Dependency.successor_id == tid)
    ).delete()
    TaskResource.query.filter_by(task_id=tid).delete()
    t = Task.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return "", 204


# ── Dependencies ───────────────────────────────────────

@app.route("/api/dependencies", methods=["GET"])
def get_dependencies():
    project_id = request.args.get("project_id", type=int)
    if project_id:
        task_ids = [t.id for t in Task.query.filter_by(project_id=project_id).all()]
        if not task_ids:
            return jsonify([])
        return jsonify([
            d.to_dict() for d in Dependency.query.filter(
                Dependency.predecessor_id.in_(task_ids)
            ).all()
        ])
    return jsonify([d.to_dict() for d in Dependency.query.all()])


@app.route("/api/dependencies", methods=["POST"])
def create_dependency():
    data = request.json
    pred_id = data["predecessor_id"]
    succ_id = data["successor_id"]
    if pred_id == succ_id:
        return jsonify({"error": "A task cannot depend on itself"}), 400
    existing = Dependency.query.filter_by(
        predecessor_id=pred_id, successor_id=succ_id
    ).first()
    if existing:
        return jsonify({"error": "Dependency already exists"}), 409
    d = Dependency(
        predecessor_id=pred_id,
        successor_id=succ_id,
        dep_type=data.get("dep_type", "FS"),
        lag=data.get("lag", 0),
    )
    db.session.add(d)
    db.session.commit()
    return jsonify(d.to_dict()), 201


@app.route("/api/dependencies/<int:did>", methods=["DELETE"])
def delete_dependency(did):
    d = Dependency.query.get_or_404(did)
    db.session.delete(d)
    db.session.commit()
    return "", 204


# ── Export / Import ────────────────────────────────────

@app.route("/api/projects/<int:pid>/export", methods=["GET"])
def export_project(pid):
    p = Project.query.get_or_404(pid)
    proj_tasks = Task.query.filter_by(project_id=pid).order_by(Task.sort_order, Task.start_date).all()
    task_ids = [t.id for t in proj_tasks]

    # Include all resources (they are a shared pool needed for assignment context)
    resources_list = Resource.query.order_by(Resource.name).all()
    task_resource_rows = TaskResource.query.filter(TaskResource.task_id.in_(task_ids)).all() if task_ids else []

    # Dependencies within this project
    deps_list = Dependency.query.filter(
        Dependency.predecessor_id.in_(task_ids),
        Dependency.successor_id.in_(task_ids),
    ).all() if task_ids else []

    # Blocked days: global, project-scoped, and resource-scoped
    blocked_days_list = BlockedDay.query.filter(
        db.or_(
            BlockedDay.scope == "global",
            db.and_(BlockedDay.scope == "project", BlockedDay.project_id == pid),
            BlockedDay.scope == "resource",
        )
    ).all()

    # Build export payload with stable local indices
    task_id_to_idx = {t.id: i for i, t in enumerate(proj_tasks)}
    res_id_to_idx = {r.id: i for i, r in enumerate(resources_list)}

    export_data = {
        "version": 1,
        "project": {"name": p.name, "description": p.description, "color": p.color},
        "resources": [{"name": r.name, "role": r.role, "color": r.color, "sort_order": r.sort_order} for r in resources_list],
        "tasks": [
            {
                "name": t.name,
                "description": t.description or "",
                "start_date": t.start_date.isoformat(),
                "end_date": t.end_date.isoformat(),
                "progress": t.progress,
                "color": t.color,
                "sort_order": t.sort_order,
                "parent_idx": task_id_to_idx.get(t.parent_id) if t.parent_id else None,
            }
            for t in proj_tasks
        ],
        "assignments": [
            {
                "task_idx": task_id_to_idx[tr.task_id],
                "resource_idx": res_id_to_idx[tr.resource_id],
                "allocation": tr.allocation,
                "role": tr.role,
            }
            for tr in task_resource_rows
        ],
        "dependencies": [
            {
                "predecessor_idx": task_id_to_idx[d.predecessor_id],
                "successor_idx": task_id_to_idx[d.successor_id],
                "dep_type": d.dep_type,
                "lag": d.lag,
            }
            for d in deps_list
        ],
        "blocked_days": [
            {
                "name": bd.name,
                "start_date": bd.start_date.isoformat(),
                "end_date": bd.end_date.isoformat(),
                "scope": bd.scope,
                "resource_idx": res_id_to_idx.get(bd.resource_id) if bd.resource_id else None,
                "color": bd.color,
            }
            for bd in blocked_days_list
        ],
    }
    return jsonify(export_data)


@app.route("/api/projects/import", methods=["POST"])
def import_project():
    data = request.json
    if not data or "project" not in data:
        return jsonify({"error": "Invalid import data"}), 400

    # Create project
    pd = data["project"]
    p = Project(name=pd["name"], description=pd.get("description", ""), color=pd.get("color", "#4a86c8"))
    db.session.add(p)
    db.session.flush()

    # Create or reuse resources (match by name)
    res_idx_to_id = {}
    for i, rd in enumerate(data.get("resources", [])):
        existing = Resource.query.filter_by(name=rd["name"]).first()
        if existing:
            res_idx_to_id[i] = existing.id
        else:
            r = Resource(name=rd["name"], role=rd.get("role", ""), color=rd.get("color", "#4a86c8"), sort_order=rd.get("sort_order", i))
            db.session.add(r)
            db.session.flush()
            res_idx_to_id[i] = r.id

    # Create tasks (two passes for parent references)
    task_idx_to_id = {}
    task_defs = data.get("tasks", [])
    for i, td in enumerate(task_defs):
        t = Task(
            name=td["name"],
            description=td.get("description", ""),
            start_date=date.fromisoformat(td["start_date"]),
            end_date=date.fromisoformat(td["end_date"]),
            progress=td.get("progress", 0),
            color=td.get("color"),
            sort_order=td.get("sort_order", i),
            project_id=p.id,
        )
        db.session.add(t)
        db.session.flush()
        task_idx_to_id[i] = t.id

    # Set parent references
    for i, td in enumerate(task_defs):
        if td.get("parent_idx") is not None:
            parent_id = task_idx_to_id.get(td["parent_idx"])
            if parent_id:
                db.session.get(Task, task_idx_to_id[i]).parent_id = parent_id

    # Create assignments
    for a in data.get("assignments", []):
        tid = task_idx_to_id.get(a["task_idx"])
        rid = res_idx_to_id.get(a["resource_idx"])
        if tid and rid:
            db.session.add(TaskResource(
                task_id=tid, resource_id=rid,
                allocation=a.get("allocation", 100),
                role=a.get("role") or None,
            ))

    # Create dependencies
    for d in data.get("dependencies", []):
        pred_id = task_idx_to_id.get(d["predecessor_idx"])
        succ_id = task_idx_to_id.get(d["successor_idx"])
        if pred_id and succ_id:
            db.session.add(Dependency(
                predecessor_id=pred_id, successor_id=succ_id,
                dep_type=d.get("dep_type", "FS"), lag=d.get("lag", 0),
            ))

    # Create blocked days
    for bd in data.get("blocked_days", []):
        scope = bd.get("scope", "global")
        resource_id = None
        if scope == "resource" and bd.get("resource_idx") is not None:
            resource_id = res_idx_to_id.get(bd["resource_idx"])
        project_id = p.id if scope == "project" else None
        db.session.add(BlockedDay(
            name=bd["name"],
            start_date=date.fromisoformat(bd["start_date"]),
            end_date=date.fromisoformat(bd["end_date"]),
            scope=scope,
            resource_id=resource_id,
            project_id=project_id,
            color=bd.get("color", "#ff6b6b"),
        ))

    db.session.commit()
    return jsonify(p.to_dict()), 201


# ── Seed demo data ─────────────────────────────────────

@app.route("/api/seed", methods=["POST"])
def seed_data():
    today = date.today()

    p1 = Project(name="Website Redesign", description="Full site overhaul", color="#4a86c8")
    p2 = Project(name="Mobile App", description="iOS/Android app", color="#e8743b")
    db.session.add_all([p1, p2])
    db.session.flush()

    r1 = Resource.query.filter_by(name="Alice").first() or Resource(name="Alice", role="Engineer", color="#4a86c8")
    r2 = Resource.query.filter_by(name="Bob").first() or Resource(name="Bob", role="Designer", color="#e8743b")
    r3 = Resource.query.filter_by(name="Carol").first() or Resource(name="Carol", role="PM", color="#19a979")
    db.session.add_all([r1, r2, r3])
    db.session.flush()

    t1 = Task(name="Requirements", start_date=today, end_date=today + timedelta(days=5),
              sort_order=0, progress=100, project_id=p1.id)
    t2 = Task(name="Design", start_date=today + timedelta(days=6), end_date=today + timedelta(days=15),
              sort_order=1, progress=60, project_id=p1.id)
    t3 = Task(name="Backend dev", start_date=today + timedelta(days=10), end_date=today + timedelta(days=25),
              sort_order=2, progress=20, project_id=p1.id)
    t4 = Task(name="Frontend dev", start_date=today + timedelta(days=16), end_date=today + timedelta(days=30),
              sort_order=3, project_id=p1.id)
    t5 = Task(name="Testing", start_date=today + timedelta(days=26), end_date=today + timedelta(days=35),
              sort_order=4, project_id=p1.id)
    t6 = Task(name="App wireframes", start_date=today, end_date=today + timedelta(days=8),
              sort_order=0, progress=40, project_id=p2.id)
    t7 = Task(name="API integration", start_date=today + timedelta(days=9), end_date=today + timedelta(days=20),
              sort_order=1, project_id=p2.id)

    db.session.add_all([t1, t2, t3, t4, t5, t6, t7])
    db.session.flush()

    # Assignments with allocation percentages
    assignments = [
        (t1, r3, 10),         # Carol: PM on requirements, light touch
        (t2, r2, 100),        # Bob: full-time design
        (t3, r1, 80),         # Alice: mostly on backend
        (t3, r2, 30),         # Bob: part-time design support on backend
        (t4, r1, 100),        # Alice: full-time frontend
        (t5, r1, 50),         # Alice: half-time testing
        (t5, r3, 20),         # Carol: PM oversight on testing
        (t6, r2, 100),        # Bob: full-time wireframes
        (t7, r1, 60),         # Alice: API integration
        (t7, r2, 40),         # Bob: API integration support
    ]
    for task, res, alloc in assignments:
        db.session.add(TaskResource(task_id=task.id, resource_id=res.id, allocation=alloc))

    db.session.add_all([
        Dependency(predecessor_id=t1.id, successor_id=t2.id),
        Dependency(predecessor_id=t2.id, successor_id=t4.id),
        Dependency(predecessor_id=t1.id, successor_id=t3.id),
        Dependency(predecessor_id=t3.id, successor_id=t5.id),
        Dependency(predecessor_id=t4.id, successor_id=t5.id),
        Dependency(predecessor_id=t6.id, successor_id=t7.id),
    ])
    db.session.commit()
    return jsonify({"msg": "Seeded"}), 201


# ── Reset all data ────────────────────────────────────

@app.route("/api/reset", methods=["POST"])
def reset_data():
    BlockedDay.query.delete()
    Dependency.query.delete()
    TaskResource.query.delete()
    Task.query.delete()
    Project.query.delete()
    Resource.query.delete()
    db.session.commit()
    return jsonify({"msg": "All data cleared"}), 200


if __name__ == "__main__":
    app.run(host=config["host"], port=config["port"], debug=config["debug"])
