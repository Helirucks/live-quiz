// ============================================================
// Live-Quiz · Spieler-Ansicht
// ============================================================

const socket = io();

const SHAPE_ICONS = {
  triangle: "▲",
  diamond: "◆",
  circle: "●",
  square: "■",
};

const COLOR_CLASS = {
  red: "answer-red",
  blue: "answer-blue",
  yellow: "answer-yellow",
  green: "answer-green",
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 28;

let timerInterval = null;
let myName = "";
let hasAnswered = false;

// ---------- Hilfsfunktionen ----------

function showScreen(name) {
  document.querySelectorAll("section[id^='screen-']").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `screen-${name}`);
  });
}

function startTimer(timeLimit) {
  clearInterval(timerInterval);

  const numberEl = document.getElementById("timer-number");
  const ringEl = document.getElementById("timer-fg");

  let timeLeft = timeLimit;
  numberEl.textContent = timeLeft;
  ringEl.style.transition = "none";
  ringEl.style.strokeDashoffset = "0";
  void ringEl.offsetWidth;
  ringEl.style.transition = "stroke-dashoffset 1s linear";

  timerInterval = setInterval(() => {
    timeLeft -= 1;
    numberEl.textContent = Math.max(timeLeft, 0);
    const offset = TIMER_CIRCUMFERENCE * (1 - Math.max(timeLeft, 0) / timeLimit);
    ringEl.style.strokeDashoffset = offset.toFixed(2);

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

function renderQuestion(data) {
  hasAnswered = false;

  document.getElementById("question-progress").textContent =
    `Frage ${data.index + 1} von ${data.total}`;
  document.getElementById("answer-status").textContent = "";

  const grid = document.getElementById("shape-grid");
  grid.innerHTML = "";

  for (let i = 0; i < data.num_answers; i++) {
    const btn = document.createElement("button");
    btn.className = `shape-btn ${COLOR_CLASS[data.colors[i]]}`;
    btn.textContent = SHAPE_ICONS[data.shapes[i]];
    btn.dataset.index = i;
    btn.addEventListener("click", () => submitAnswer(i));
    grid.appendChild(btn);
  }

  startTimer(data.time_limit);
  showScreen("question");
}

function submitAnswer(index) {
  if (hasAnswered) return;
  hasAnswered = true;

  const buttons = document.querySelectorAll("#shape-grid .shape-btn");
  buttons.forEach((btn) => {
    btn.disabled = true;
    if (Number(btn.dataset.index) === index) {
      btn.classList.add("is-selected");
    } else {
      btn.classList.add("is-faded");
    }
  });

  document.getElementById("answer-status").textContent =
    "Antwort gesendet ✓ – warte auf die anderen …";

  socket.emit("submit_answer", { answer_index: index });
}

function renderResult(data) {
  clearInterval(timerInterval);

  const banner = document.getElementById("result-banner");
  const title = document.getElementById("result-title");
  const points = document.getElementById("result-points");

  if (data.your_answer === null) {
    banner.className = "result-banner is-incorrect";
    title.textContent = "Keine Antwort ⏱️";
  } else if (data.correct) {
    banner.className = "result-banner is-correct";
    title.textContent = "Richtig! 🎉";
  } else {
    banner.className = "result-banner is-incorrect";
    title.textContent = "Leider falsch";
  }

  points.textContent = `+${data.points} Punkte`;
  document.getElementById("total-score").textContent = data.total_score;

  showScreen("result");
}

function renderEnded(data) {
  const me = data.leaderboard.find((p) => p.name === myName);
  document.getElementById("final-score").textContent = me ? me.score : 0;
  showScreen("ended");
}

// ---------- Beitreten ----------

function tryJoin() {
  const name = document.getElementById("name-input").value.trim();
  document.getElementById("join-error").textContent = "";

  if (!name) {
    document.getElementById("join-error").textContent = "Bitte gib einen Namen ein.";
    return;
  }

  socket.emit("join_game", { name });
}

document.getElementById("btn-join").addEventListener("click", tryJoin);
document.getElementById("name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryJoin();
});

// ---------- Socket-Events ----------

socket.on("join_error", (data) => {
  document.getElementById("join-error").textContent = data.message;
});

socket.on("join_success", (data) => {
  myName = data.name;
  document.getElementById("waiting-title").textContent = `Hallo, ${myName}!`;
  showScreen("waiting");
});

socket.on("new_question_player", (data) => {
  renderQuestion(data);
});

socket.on("question_result_player", (data) => {
  renderResult(data);
});

socket.on("quiz_end", (data) => {
  renderEnded(data);
});

socket.on("returned_to_lobby", () => {
  if (myName) {
    document.getElementById("waiting-title").textContent = `Hallo, ${myName}!`;
    showScreen("waiting");
  }
});
