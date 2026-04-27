from flask_sqlalchemy import SQLAlchemy
from datetime import date

db = SQLAlchemy()


class TaskResource(db.Model):
    __tablename__ = "task_resource"
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), primary_key=True)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), primary_key=True)
    allocation = db.Column(db.Integer, default=100)  # percentage 0-100

    resource = db.relationship("Resource", lazy=True)


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="")
    color = db.Column(db.String(7), default="#4a86c8")
    tasks = db.relationship("Task", backref="project", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
        }


class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(120), default="")
    color = db.Column(db.String(7), default="#4a86c8")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "color": self.color,
        }


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="")
    start_date = db.Column(db.Date, nullable=False, default=date.today)
    end_date = db.Column(db.Date, nullable=False, default=date.today)
    progress = db.Column(db.Integer, default=0)
    color = db.Column(db.String(7), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    parent_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=True)

    children = db.relationship("Task", backref=db.backref("parent", remote_side="Task.id"), lazy=True)
    task_resources = db.relationship("TaskResource", backref="task", lazy=True, cascade="all, delete-orphan")
    predecessors = db.relationship(
        "Dependency", foreign_keys="Dependency.successor_id", backref="successor_task", lazy=True
    )
    successors = db.relationship(
        "Dependency", foreign_keys="Dependency.predecessor_id", backref="predecessor_task", lazy=True
    )

    def to_dict(self):
        res_list = [
            {"id": tr.resource.id, "name": tr.resource.name, "color": tr.resource.color, "allocation": tr.allocation}
            for tr in self.task_resources
        ]
        first_color = res_list[0]["color"] if res_list else "#4a86c8"
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "progress": self.progress,
            "resource_ids": [r["id"] for r in res_list],
            "resources": res_list,
            "resource_name": ", ".join(
                f'{r["name"]} ({r["allocation"]}%)' if r["allocation"] != 100 else r["name"]
                for r in res_list
            ) or None,
            "color": self.color or first_color,
            "sort_order": self.sort_order,
            "parent_id": self.parent_id,
            "project_id": self.project_id,
        }


class Dependency(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    predecessor_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    successor_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    dep_type = db.Column(db.String(2), default="FS")
    lag = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.UniqueConstraint("predecessor_id", "successor_id", name="uq_dependency"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "predecessor_id": self.predecessor_id,
            "successor_id": self.successor_id,
            "dep_type": self.dep_type,
            "lag": self.lag,
        }
