import sqlite3

from flask import (Blueprint, flash, redirect, render_template, request,
                   session, url_for)

from ..db import get_db
from .service import create_user, verify_user

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        if not username or len(username) > 40:
            flash("Username must be 1–40 characters.")
        elif len(password) < 4:
            flash("Password must be at least 4 characters.")
        else:
            try:
                uid = create_user(get_db(), username, password)
            except sqlite3.IntegrityError:
                flash("That username is taken.")
            else:
                session.clear()
                session["user_id"] = uid
                return redirect(url_for("main.home"))
    return render_template("auth/signup.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        row = verify_user(get_db(), username, password)
        if row is None:
            flash("Wrong username or password.")
        else:
            session.clear()
            session["user_id"] = row["id"]
            return redirect(url_for("main.home"))
    return render_template("auth/login.html")


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("main.home"))
