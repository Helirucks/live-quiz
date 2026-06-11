// ============================================================
// Live-Quiz · Quizmaster-Ansicht
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

const COLOR_VALUE = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 28; // ~175.93, matches r=28 in SVG

let currentQuestion = null;   // Daten der aktuell laufenden Frage
let timerInterval = null;
let isLastQuestion = false;

// ---------- Hilfsfunktionen ----------

function showScreen(name) {
  document.querySelectorAll("section[id^='screen-']").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `screen-${name}`);
  });
}

function setupJoinInfo() {
  const joinUrl = `${window.location.origin}/play`;
  document.getElementById("join-url").textContent = joinUrl;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
  document.getElementById("qr-code").src = qrUrl;
}

function renderPlayerList(players) {
  const list = document.getElementById("player-list");
  const count = document.getElementById("player-count");

  list.innerHTML = "";
  players.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.textContent = p.name;
    list.appendChild(chip);
  });

  count.textContent = `(${players.length})`;
  document.getElementById("btn-start").disabled = players.length === 0;
}

function startTimer(timeLimit) {
  clearInterval(timerInterval);

  const numberEl = document.getElementById("timer-number");
  const ringEl = document.getElementById("timer-fg");

  let timeLeft = timeLimit;
  numberEl.textContent = timeLeft;
  ringEl.style.transition = "none";
  ringEl.style.strokeDashoffset = "0";
  // Force reflow so the "none" transition is applied before we re-enable it
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
  currentQuestion = data;

  document.getElementById("question-progress").textContent =
    `Frage ${data.index + 1} von ${data.total}`;
  document.getElementById("question-text").textContent = data.question;
  document.getElementById("answer-progress").textContent =
    `0 von ${data.players_total} haben geantwortet`;

  const grid = document.getElementById("answer-grid");
  grid.innerHTML = "";

  data.answers.forEach((answerText, i) => {
    const btn = document.createElement("div");
    btn.className = `answer-btn ${COLOR_CLASS[data.colors[i]]}`;
    btn.innerHTML = `<span class="shape">${SHAPE_ICONS[data.shapes[i]]}</span><span>${answerText}</span>`;
    grid.appendChild(btn);
  });

  startTimer(data.time_limit);
  showScreen("question");
}

function renderResults(data) {
  clearInterval(timerInterval);
  isLastQuestion = data.is_last;

  // Antworttext der korrekten Lösung anzeigen
  document.getElementById("correct-answer-text").textContent =
    currentQuestion.answers[data.correct_index];

  // Antworten im Frage-Bildschirm farblich markieren (für den Fall,
  // dass der Quizmaster kurz zurückblendet)
  const buttons = document.querySelectorAll("#answer-grid .answer-btn");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("is-correct", i === data.correct_index);
    btn.classList.toggle("is-faded", i !== data.correct_index);
  });

  // Balkendiagramm der Antwortverteilung
  const chart = document.getElementById("bar-chart");
  chart.innerHTML = "";
  const maxCount = Math.max(1, ...data.answer_counts);

  data.answer_counts.forEach((count, i) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const bar = document.createElement("div");
    bar.className = "bar";
    const heightPct = Math.round((count / maxCount) * 100);
    bar.style.height = `${Math.max(heightPct, 4)}%`;
    bar.style.background = COLOR_VALUE[currentQuestion.colors[i]];
    bar.textContent = count;
    if (i === data.correct_index) {
      bar.style.outline = "3px solid #fff";
    }

    const shape = document.createElement("div");
    shape.className = "bar-shape";
    shape.textContent = SHAPE_ICONS[currentQuestion.shapes[i]];

    col.appendChild(bar);
    col.appendChild(shape);
    chart.appendChild(col);
  });

  // Bestenliste
  const list = document.getElementById("leaderboard");
  list.innerHTML = "";
  data.leaderboard.forEach((entry, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><span class="rank">#${i + 1}</span>${entry.name}</span><span class="score">${entry.score}</span>`;
    list.appendChild(li);
  });

  document.getElementById("btn-next").textContent =
    isLastQuestion ? "Endergebnis anzeigen" : "Nächste Frage";

  showScreen("results");
}

function renderEnded(data) {
  const podium = document.getElementById("podium");
  podium.innerHTML = "";

  const top3 = data.leaderboard.slice(0, 3);
  // Reihenfolge auf dem Podium: 2. Platz, 1. Platz, 3. Platz
  const order = [1, 0, 2];
  order.forEach((idx) => {
    const entry = top3[idx];
    if (!entry) return;
    const step = document.createElement("div");
    step.className = `podium-step podium-${idx + 1}`;
    step.innerHTML = `<span class="place">#${idx + 1}</span>${entry.name}<br>${entry.score}`;
    podium.appendChild(step);
  });

  const list = document.getElementById("final-leaderboard");
  list.innerHTML = "";
  data.leaderboard.forEach((entry, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><span class="rank">#${i + 1}</span>${entry.name}</span><span class="score">${entry.score}</span>`;
    list.appendChild(li);
  });

  showScreen("ended");
}

// ---------- Socket-Events ----------

socket.on("connect", () => {
  socket.emit("host_join");
});

socket.on("host_status", (data) => {
  setupJoinInfo();
  renderPlayerList(data.players);
  showScreen("lobby");
});

socket.on("player_list_update", (players) => {
  renderPlayerList(players);
});

socket.on("host_error", (data) => {
  document.getElementById("lobby-error").textContent = data.message;
});

socket.on("new_question_host", (data) => {
  document.getElementById("lobby-error").textContent = "";
  renderQuestion(data);
});

socket.on("answer_progress", (data) => {
  document.getElementById("answer-progress").textContent =
    `${data.answered} von ${data.total} haben geantwortet`;
});

socket.on("question_results_host", (data) => {
  renderResults(data);
});

socket.on("quiz_end", (data) => {
  renderEnded(data);
});

socket.on("returned_to_lobby", () => {
  showScreen("lobby");
});

// ---------- Buttons ----------

document.getElementById("btn-start").addEventListener("click", () => {
  socket.emit("start_quiz");
});

document.getElementById("btn-next").addEventListener("click", () => {
  socket.emit("next_question");
});

document.getElementById("btn-restart").addEventListener("click", () => {
  socket.emit("restart_quiz");
});
