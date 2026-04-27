from flask import Flask, render_template, request, jsonify
from models import db, Resource, Task, Dependency
from datetime import date, timedelta
import os

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///planner.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

with app.app_context():
    db.create_all()


@app.route("/")
def index():
    return render_template("index.html")


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
    r = Resource.query.get_or_404(rid)
    db.session.delete(r)
    db.session.commit()
    return "", 204


# ── Tasks ──────────────────────────────────────────────

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    tasks = Task.query.order_by(Task.sort_order, Task.start_date).all()
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
        resource_id=data.get("resource_id"),
        color=data.get("color"),
        sort_order=data.get("sort_order", 0),
        parent_id=data.get("parent_id"),
    )
    db.session.add(t)
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
    if "resource_id" in data:
        t.resource_id = data["resource_id"]
    if "color" in data:
        t.color = data["color"]
    if "sort_order" in data:
        t.sort_order = data["sort_order"]
    if "parent_id" in data:
        t.parent_id = data["parent_id"]
    db.session.commit()
    return jsonify(t.to_dict())


@app.route("/api/tasks/<int:tid>", methods=["DELETE"])
def delete_task(tid):
    Dependency.query.filter(
        (Dependency.predecessor_id == tid) | (Dependency.successor_id == tid)
    ).delete()
    t = Task.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return "", 204


# ── Dependencies ───────────────────────────────────────

@app.route("/api/dependencies", methods=["GET"])
def get_dependencies():
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
    r1 = Resource(name="Alice", role="Engineer", color="#4a86c8")
    r2 = Resource(name="Bob", role="Designer", color="#e8743b")
    r3 = Resource(name="Carol", role="PM", color="#19a979")
    db.session.add_all([r1, r2, r3])
    db.session.flush()

    t1 = Task(name="Requirements", start_date=today, end_date=today + timedelta(days=5),
              resource_id=r3.id, sort_order=0, progress=100)
    t2 = Task(name="Design", start_date=today + timedelta(days=6), end_date=today + timedelta(days=15),
              resource_id=r2.id, sort_order=1, progress=60)
    t3 = Task(name="Backend dev", start_date=today + timedelta(days=10), end_date=today + timedelta(days=25),
              resource_id=r1.id, sort_order=2, progress=20)
    t4 = Task(name="Frontend dev", start_date=today + timedelta(days=16), end_date=today + timedelta(days=30),
              resource_id=r1.id, sort_order=3)
    t5 = Task(name="Testing", start_date=today + timedelta(days=26), end_date=today + timedelta(days=35),
              resource_id=r3.id, sort_order=4)
    db.session.add_all([t1, t2, t3, t4, t5])
    db.session.flush()

    db.session.add_all([
        Dependency(predecessor_id=t1.id, successor_id=t2.id),
        Dependency(predecessor_id=t2.id, successor_id=t4.id),
        Dependency(predecessor_id=t1.id, successor_id=t3.id),
        Dependency(predecessor_id=t3.id, successor_id=t5.id),
        Dependency(predecessor_id=t4.id, successor_id=t5.id),
    ])
    db.session.commit()
    return jsonify({"msg": "Seeded"}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5000)
