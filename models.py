from flask_sqlalchemy import SQLAlchemy
from datetime import date

db = SQLAlchemy()


class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(120), default="")
    color = db.Column(db.String(7), default="#4a86c8")
    tasks = db.relationship("Task", backref="resource", lazy=True)

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
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=True)
    color = db.Column(db.String(7), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    parent_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=True)

    children = db.relationship("Task", backref=db.backref("parent", remote_side="Task.id"), lazy=True)
    predecessors = db.relationship(
        "Dependency", foreign_keys="Dependency.successor_id", backref="successor_task", lazy=True
    )
    successors = db.relationship(
        "Dependency", foreign_keys="Dependency.predecessor_id", backref="predecessor_task", lazy=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "progress": self.progress,
            "resource_id": self.resource_id,
            "resource_name": self.resource.name if self.resource else None,
            "color": self.color or (self.resource.color if self.resource else "#4a86c8"),
            "sort_order": self.sort_order,
            "parent_id": self.parent_id,
        }


class Dependency(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    predecessor_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    successor_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    dep_type = db.Column(db.String(2), default="FS")  # FS, SS, FF, SF
    lag = db.Column(db.Integer, default=0)  # lag in days

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
