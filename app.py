"""
Live-Quiz Server (Kahoot-Klon)
==============================

Dieser Server hält den gesamten Spielzustand im Arbeitsspeicher (für eine
einzelne, gleichzeitig laufende Quiz-Session - perfekt für eine Vorlesung
mit einer überschaubaren Gruppe).

Es gibt zwei "Rollen":
- Host  (du): öffnet /host am Beamer, steuert das Quiz
- Spieler: öffnen /play auf dem Handy, treten bei und beantworten Fragen

Die Kommunikation läuft über WebSockets (Flask-SocketIO), damit alle
Geräte sofort mitbekommen, wenn sich etwas ändert (neue Frage, Ergebnisse, ...).
"""

import json
import os
import time

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bitte-aendern-vor-produktion")

# "threading" funktioniert auf jeder Python-Version (auch 3.13/3.14) ohne
# zusätzliche Bibliotheken wie eventlet/gevent. Für eine Vorlesung mit
# wenigen Teilnehmenden ist das völlig ausreichend.
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")

QUESTIONS_FILE = os.path.join(os.path.dirname(__file__), "questions.json")
with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
    QUESTIONS = json.load(f)

# Farben & Formen für die 4 Antwortmöglichkeiten (wie bei Kahoot)
ANSWER_COLORS = ["red", "blue", "yellow", "green"]
ANSWER_SHAPES = ["triangle", "diamond", "circle", "square"]

# Punkte-Berechnung: schnellere richtige Antworten geben mehr Punkte
MAX_POINTS = 1000
MIN_POINTS_CORRECT = 500


# ---------------------------------------------------------------------------
# Spielzustand (ein einziges, globales Quiz - reicht für eine Vorlesung)
# ---------------------------------------------------------------------------

game = {
    "state": "lobby",            # lobby | question | results | ended
    "current_question": -1,
    "question_start_time": None,
    "question_active": False,
    "host_sid": None,
    "players": {},                # sid -> {name, score, answered, answer, answer_time}
}


def get_player_list():
    return [{"name": p["name"], "score": p["score"]} for p in game["players"].values()]


# ---------------------------------------------------------------------------
# Normale HTTP-Routen (liefern die HTML-Seiten aus)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/host")
def host_page():
    return render_template("host.html", total_questions=len(QUESTIONS))


@app.route("/play")
def play_page():
    return render_template("player.html")


# ---------------------------------------------------------------------------
# Socket.IO Events: Verbindung / Lobby
# ---------------------------------------------------------------------------

@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    if sid in game["players"]:
        del game["players"][sid]
        if game["host_sid"]:
            socketio.emit("player_list_update", get_player_list(), room="host")
    if sid == game["host_sid"]:
        game["host_sid"] = None


@socketio.on("host_join")
def on_host_join():
    """Der Host öffnet die Steuerseite."""
    game["host_sid"] = request.sid
    join_room("host")
    emit("host_status", {
        "state": game["state"],
        "players": get_player_list(),
        "total_questions": len(QUESTIONS),
    })


@socketio.on("join_game")
def on_join_game(data):
    """Ein Teilnehmer tritt mit seinem Namen bei."""
    name = (data or {}).get("name", "").strip()

    if not name:
        emit("join_error", {"message": "Bitte gib einen Namen ein."})
        return
    if len(name) > 20:
        name = name[:20]
    if game["state"] != "lobby":
        emit("join_error", {"message": "Das Quiz läuft bereits. Bitte warte auf die nächste Runde."})
        return
    if any(p["name"].lower() == name.lower() for p in game["players"].values()):
        emit("join_error", {"message": "Dieser Name ist schon vergeben."})
        return

    join_room("players")
    game["players"][request.sid] = {
        "name": name,
        "score": 0,
        "answered": False,
        "answer": None,
        "answer_time": None,
    }

    emit("join_success", {"name": name})

    if game["host_sid"]:
        socketio.emit("player_list_update", get_player_list(), room="host")


# ---------------------------------------------------------------------------
# Socket.IO Events: Quiz-Ablauf (vom Host gesteuert)
# ---------------------------------------------------------------------------

@socketio.on("start_quiz")
def on_start_quiz():
    if request.sid != game["host_sid"]:
        return
    if not game["players"]:
        emit("host_error", {"message": "Es sind noch keine Spieler beigetreten."})
        return

    for p in game["players"].values():
        p["score"] = 0

    game["current_question"] = -1
    next_question()


def next_question():
    """Schaltet zur nächsten Frage weiter (oder beendet das Quiz)."""
    game["current_question"] += 1
    idx = game["current_question"]

    if idx >= len(QUESTIONS):
        end_quiz()
        return

    q = QUESTIONS[idx]

    for p in game["players"].values():
        p["answered"] = False
        p["answer"] = None
        p["answer_time"] = None

    game["state"] = "question"
    game["question_active"] = True
    game["question_start_time"] = time.time()

    # Host sieht die volle Frage inkl. Antworttexten
    socketio.emit("new_question_host", {
        "index": idx,
        "total": len(QUESTIONS),
        "question": q["question"],
        "answers": q["answers"],
        "time_limit": q["time_limit"],
        "colors": ANSWER_COLORS,
        "shapes": ANSWER_SHAPES,
        "players_total": len(game["players"]),
    }, room="host")

    # Spieler sehen nur die 4 farbigen Formen (wie bei Kahoot), keinen Text
    socketio.emit("new_question_player", {
        "index": idx,
        "total": len(QUESTIONS),
        "time_limit": q["time_limit"],
        "num_answers": len(q["answers"]),
        "colors": ANSWER_COLORS,
        "shapes": ANSWER_SHAPES,
    }, room="players")

    # Server-seitiger Timer: wenn die Zeit abläuft, wird automatisch ausgewertet
    socketio.start_background_task(question_timer, idx, q["time_limit"])


def question_timer(question_index, time_limit):
    socketio.sleep(time_limit)
    if game["question_active"] and game["current_question"] == question_index:
        end_question()


@socketio.on("submit_answer")
def on_submit_answer(data):
    sid = request.sid
    if sid not in game["players"] or not game["question_active"]:
        return

    p = game["players"][sid]
    if p["answered"]:
        return  # nur eine Antwort pro Frage

    answer_index = (data or {}).get("answer_index")
    p["answered"] = True
    p["answer"] = answer_index
    p["answer_time"] = time.time() - game["question_start_time"]

    answered_count = sum(1 for pl in game["players"].values() if pl["answered"])
    socketio.emit("answer_progress", {
        "answered": answered_count,
        "total": len(game["players"]),
    }, room="host")

    # Wenn alle geantwortet haben, nicht auf den Timer warten
    if game["players"] and answered_count == len(game["players"]):
        end_question()


def end_question():
    """Wertet die aktuelle Frage aus, vergibt Punkte und informiert alle."""
    if not game["question_active"]:
        return
    game["question_active"] = False
    game["state"] = "results"

    idx = game["current_question"]
    q = QUESTIONS[idx]
    correct_index = q["correct"]
    time_limit = q["time_limit"]

    answer_counts = [0] * len(q["answers"])

    for sid, p in game["players"].items():
        is_correct = p["answer"] == correct_index
        points = 0

        if p["answer"] is not None:
            answer_counts[p["answer"]] += 1

        if is_correct:
            t = p["answer_time"] if p["answer_time"] is not None else time_limit
            t = max(0.0, min(t, time_limit))
            # Je schneller, desto mehr Punkte (zwischen MIN und MAX)
            points = round(MAX_POINTS - (t / time_limit) * (MAX_POINTS - MIN_POINTS_CORRECT))

        p["score"] += points

        socketio.emit("question_result_player", {
            "correct": is_correct,
            "correct_index": correct_index,
            "your_answer": p["answer"],
            "points": points,
            "total_score": p["score"],
            "colors": ANSWER_COLORS,
            "shapes": ANSWER_SHAPES,
        }, room=sid)

    leaderboard = sorted(
        ({"name": p["name"], "score": p["score"]} for p in game["players"].values()),
        key=lambda x: x["score"],
        reverse=True,
    )

    socketio.emit("question_results_host", {
        "correct_index": correct_index,
        "answer_counts": answer_counts,
        "leaderboard": leaderboard[:5],
        "is_last": idx == len(QUESTIONS) - 1,
    }, room="host")


@socketio.on("next_question")
def on_next_question():
    if request.sid != game["host_sid"]:
        return
    next_question()


def end_quiz():
    game["state"] = "ended"
    leaderboard = sorted(
        ({"name": p["name"], "score": p["score"]} for p in game["players"].values()),
        key=lambda x: x["score"],
        reverse=True,
    )
    socketio.emit("quiz_end", {"leaderboard": leaderboard}, room="host")
    socketio.emit("quiz_end", {"leaderboard": leaderboard}, room="players")


@socketio.on("restart_quiz")
def on_restart_quiz():
    """Host startet eine neue Runde mit denselben Spielern."""
    if request.sid != game["host_sid"]:
        return

    game["state"] = "lobby"
    game["current_question"] = -1
    game["question_active"] = False

    for p in game["players"].values():
        p["score"] = 0
        p["answered"] = False
        p["answer"] = None
        p["answer_time"] = None

    socketio.emit("returned_to_lobby", {}, room="host")
    socketio.emit("returned_to_lobby", {}, room="players")
    socketio.emit("player_list_update", get_player_list(), room="host")


# ---------------------------------------------------------------------------
# Lokaler Start (für Tests auf dem eigenen Rechner)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # allow_unsafe_werkzeug: für lokale Tests im eigenen Netzwerk unkritisch.
    # Beim Deployment über gunicorn (siehe Procfile) wird dieser Code
    # gar nicht ausgeführt.
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
