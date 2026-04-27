from flask import Flask, render_template, request, jsonify
from models import db, Resource, Task, Dependency, Project, TaskResource
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
    }
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            defaults.update(json.load(f))
    return defaults

config = load_config()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = config["database_uri"]
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = config["secret_key"]
db.init_app(app)

with app.app_context():
    db.create_all()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    safe = {k: v for k, v in config.items() if k != "secret_key"}
    return jsonify(safe)


@app.route("/api/config", methods=["PUT"])
def update_config():
    data = request.json
    allowed = {"host", "port", "debug", "database_uri", "app_name"}
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
    db.session.delete(p)
    db.session.commit()
    return "", 204


# ── Resources ──────────────────────────────────────────

@app.route("/api/resources", methods=["GET"])
def get_resources():
    return jsonify([r.to_dict() for r in Resource.query.order_by(Resource.name).all()])


@app.route("/api/resources", methods=["POST"])
def create_resource():
    data = request.json
    r = Resource(
        name=data["name"],
        role=data.get("role", ""),
        color=data.get("color", "#4a86c8"),
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
    db.session.commit()
    return jsonify(r.to_dict())


@app.route("/api/resources/<int:rid>", methods=["DELETE"])
def delete_resource(rid):
    TaskResource.query.filter_by(resource_id=rid).delete()
    r = Resource.query.get_or_404(rid)
    db.session.delete(r)
    db.session.commit()
    return "", 204


def _sync_task_resources(t, resource_entries):
    """resource_entries: list of {id, allocation} dicts or plain int ids."""
    TaskResource.query.filter_by(task_id=t.id).delete()
    for entry in (resource_entries or []):
        if isinstance(entry, dict):
            rid = entry["id"]
            alloc = entry.get("allocation", 100)
        else:
            rid = entry
            alloc = 100
        db.session.add(TaskResource(task_id=t.id, resource_id=rid, allocation=alloc))


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
    t = Task(
        name=data["name"],
        description=data.get("description", ""),
        start_date=date.fromisoformat(data["start_date"]),
        end_date=date.fromisoformat(data["end_date"]),
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
    if "name" in data:
        t.name = data["name"]
    if "description" in data:
        t.description = data["description"]
    if "start_date" in data:
        t.start_date = date.fromisoformat(data["start_date"])
    if "end_date" in data:
        t.end_date = date.fromisoformat(data["end_date"])
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


# ── Seed demo data ─────────────────────────────────────

@app.route("/api/seed", methods=["POST"])
def seed_data():
    if Task.query.count() > 0:
        return jsonify({"msg": "Data already exists"}), 200

    today = date.today()

    p1 = Project(name="Website Redesign", description="Full site overhaul", color="#4a86c8")
    p2 = Project(name="Mobile App", description="iOS/Android app", color="#e8743b")
    db.session.add_all([p1, p2])
    db.session.flush()

    r1 = Resource(name="Alice", role="Engineer", color="#4a86c8")
    r2 = Resource(name="Bob", role="Designer", color="#e8743b")
    r3 = Resource(name="Carol", role="PM", color="#19a979")
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


if __name__ == "__main__":
    app.run(host=config["host"], port=config["port"], debug=config["debug"])
