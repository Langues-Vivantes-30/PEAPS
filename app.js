const TIMER_IDS = ["understanding", "production", "interaction"];
const HOTKEYS = { "1": "understanding", "2": "production", "3": "interaction" };
const WORDS_REFERENCE = 15;      // maximum for "number of new words"
const SENTENCES_REFERENCE = 8;   // maximum for "number of new sentences"
const STUDENTS_MAX = 35;         // maximum for "number of students"
// Timer scale: "share" = share of the cumulated time of the 3 observed activities
//              "max"   = ratio to the largest of the 3 timers (largest = 100%)
const TIMER_SCALE_MODE = "share";
// Visual enlargement of the timer axes: displayed radius = share ^ exponent.
// 1 = linear (thirds at 33%), 0.5 = square root (thirds at 58%), lower = larger.
// 0 stays at 0, and 100% is only reached if a single activity holds all the time.
const TIMER_SHARE_EXPONENT = 0.5;

const timers = Object.fromEntries(TIMER_IDS.map(id => [id, { startedAt: null, elapsedMs: 0 }]));
const keyPressCounts = { "1": 0, "2": 0, "3": 0 };

function display(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0
    ? `${String(hours).padStart(2,"0")}:${String(remainingMinutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`
    : `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function currentElapsed(id, now = Date.now()) {
  const timer = timers[id];
  return timer.elapsedMs + (timer.startedAt === null ? 0 : now - timer.startedAt);
}

function updateTimerUI(id) {
  const timer = timers[id];
  const running = timer.startedAt !== null;
  document.getElementById(`display-${id}`).textContent = display(currentElapsed(id));
  document.getElementById(`total-${id}`).textContent = display(timer.elapsedMs);
  document.querySelector(`[data-action="start"][data-target="${id}"]`).disabled = running;
  document.querySelector(`[data-action="pause"][data-target="${id}"]`).disabled = !running;
  const key = Object.keys(HOTKEYS).find(number => HOTKEYS[number] === id);
  document.getElementById(`status-${id}`).textContent =
    `${running ? "Running" : (timer.elapsedMs > 0 ? "Paused" : "Ready")} · Key ${key}`;
}

function getSessionDurationMinutes() {
  const startValue = document.getElementById("session-start").value;
  const endValue = document.getElementById("session-end").value;
  if (!startValue || !endValue) return null;
  const [sh, sm] = startValue.split(":").map(Number);
  const [eh, em] = endValue.split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60; // Session crossing midnight.
  return end - start;
}

function getStudentsTotal() {
  return Math.min(Math.floor(getNumericValue("number-students")), STUDENTS_MAX);
}

function getStudentsWhoSpeak() {
  return Math.min(Math.floor(getNumericValue("number-speak")), getStudentsTotal());
}

function showStudentsMessage(text = "") {
  document.getElementById("students-message").textContent = text;
}

// Keeps "students who speak" between 0 and the number of students.
function syncSpeakField(message = true) {
  const total = getStudentsTotal();
  const speakInput = document.getElementById("number-speak");
  speakInput.max = total;
  const raw = speakInput.value === "" ? 0 : Math.floor(Number(speakInput.value));
  if (Number.isFinite(raw) && raw > total) {
    speakInput.value = total;
    if (message) {
      showStudentsMessage(total === 0
        ? "Enter the number of students first."
        : "The number of students who speak cannot exceed the number of students.");
    }
  } else if (Number.isFinite(raw) && raw < 0) {
    speakInput.value = 0;
  } else if (message) {
    showStudentsMessage("");
  }
}

function adjustStudentsWhoSpeak(delta) {
  const total = getStudentsTotal();
  const speakInput = document.getElementById("number-speak");
  const current = getStudentsWhoSpeak();
  if (delta > 0 && current >= total) {
    showStudentsMessage(total === 0
      ? "Enter the number of students first."
      : "All students are already counted as having spoken.");
    return;
  }
  speakInput.value = Math.max(0, Math.min(current + delta, total));
  showStudentsMessage("");
  updateChart();
}

function getNumericValue(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function updateSessionDuration() {
  const duration = getSessionDurationMinutes();
  const output = document.getElementById("session-duration");
  const error = document.getElementById("session-time-error");
  if (duration === null) {
    output.textContent = "— min";
    error.textContent = "";
  } else if (duration === 0) {
    output.textContent = "0 min";
    error.textContent = "The beginning and end times are identical. Please check the session times.";
  } else {
    output.textContent = `${duration} min`;
    error.textContent = "";
  }
  updateChart();
  updateExportState();
}

function updateChart() {
  const sessionMinutes = getSessionDurationMinutes();
  const sessionMs = sessionMinutes > 0 ? sessionMinutes * 60000 : null;
  const words = getNumericValue("number-words");
  const sentences = getNumericValue("number-sentences");
  const studentsTotal = getStudentsTotal();
  const studentsWhoSpeak = getStudentsWhoSpeak();

  // Timer axes: each timer is expressed relative to the 3 observed activities.
  // A timer at zero stays at 0; all zero -> radar stays at 0.
  const timerValues = TIMER_IDS.map(id => currentElapsed(id));
  const timerTotal = timerValues.reduce((s, v) => s + v, 0);
  const timerMax = Math.max(...timerValues);
  const timerDenominator = TIMER_SCALE_MODE === "max" ? timerMax : timerTotal;
  const timerRatios = timerValues.map(v => {
    if (timerDenominator <= 0 || v <= 0) return 0;
    const ratio = v / timerDenominator;
    return TIMER_SCALE_MODE === "max" ? ratio : Math.pow(ratio, TIMER_SHARE_EXPONENT);
  });

  // Axis order (clockwise from the top): Understanding, Production, Interaction,
  // % of students who speak, new words (max 15), new sentences (max 8), each capped at 100%.
  const values = [
    ...timerRatios,
    studentsTotal > 0 ? Math.min(studentsWhoSpeak / studentsTotal, 1) : 0,
    Math.min(words / WORDS_REFERENCE, 1),
    Math.min(sentences / SENTENCES_REFERENCE, 1)
  ];

  const center = { x: 300, y: 260 };
  const radius = 175;
  const vertices = Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + i * (2 * Math.PI / 6);
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });

  const grid = document.getElementById("radar-grid");
  grid.innerHTML = "";

  [0.2, 0.4, 0.6, 0.8, 1].forEach(factor => {
    const points = vertices.map(v =>
      `${center.x + (v.x-center.x)*factor},${center.y + (v.y-center.y)*factor}`
    ).join(" ");
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", points);
    grid.appendChild(polygon);
  });

  vertices.forEach(vertex => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", center.x);
    line.setAttribute("y1", center.y);
    line.setAttribute("x2", vertex.x);
    line.setAttribute("y2", vertex.y);
    grid.appendChild(line);
  });

  const dataPoints = vertices.map((vertex, i) => ({
    x: center.x + (vertex.x-center.x)*values[i],
    y: center.y + (vertex.y-center.y)*values[i]
  }));
  document.getElementById("radar-data").setAttribute(
    "points", dataPoints.map(p => `${p.x},${p.y}`).join(" ")
  );

  document.getElementById("chart-understanding").textContent = display(currentElapsed("understanding"));
  document.getElementById("chart-production").textContent = display(currentElapsed("production"));
  document.getElementById("chart-interaction").textContent = display(currentElapsed("interaction"));
  document.getElementById("chart-words").textContent = words;
  document.getElementById("chart-sentences").textContent = sentences;
  const speakPercent = studentsTotal > 0 ? Math.round(studentsWhoSpeak / studentsTotal * 100) : 0;
  document.getElementById("chart-students").textContent =
    `${studentsWhoSpeak} / ${studentsTotal} · ${speakPercent} %`;
}

function startTimer(id) {
  if (timers[id].startedAt !== null) return;
  timers[id].startedAt = Date.now();
  updateTimerUI(id);
  saveState();
}

function pauseTimer(id) {
  const timer = timers[id];
  if (timer.startedAt === null) return;
  timer.elapsedMs += Date.now() - timer.startedAt;
  timer.startedAt = null;
  updateTimerUI(id);
  updateChart();
  saveState();
}

document.querySelectorAll('[data-action="start"]').forEach(button => {
  button.addEventListener("click", () => startTimer(button.dataset.target));
});
document.querySelectorAll('[data-action="pause"]').forEach(button => {
  button.addEventListener("click", () => pauseTimer(button.dataset.target));
});

// Successive presses of each number key alternate Start / Pause.
// Shortcuts are ignored while typing in an input or textarea.
document.addEventListener("keydown", event => {
  if (!Object.prototype.hasOwnProperty.call(HOTKEYS, event.key)) return;
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  const tag = event.target?.tagName?.toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
  event.preventDefault();

  keyPressCounts[event.key] += 1;
  const id = HOTKEYS[event.key];
  if (keyPressCounts[event.key] % 2 === 1) startTimer(id);
  else pauseTimer(id);
});

document.getElementById("reset-button").addEventListener("click", () => {
  const anyRunning = TIMER_IDS.some(id => timers[id].startedAt !== null);
  if (anyRunning && !window.confirm("A timer is still running. Reset all timers anyway?")) return;

  TIMER_IDS.forEach(id => {
    timers[id].startedAt = null;
    timers[id].elapsedMs = 0;
    updateTimerUI(id);
  });
  Object.keys(keyPressCounts).forEach(key => { keyPressCounts[key] = 0; });
  document.getElementById("session-title").value = "";
  document.getElementById("session-level").value = "";
  document.getElementById("session-start").value = "";
  document.getElementById("session-end").value = "";
  document.getElementById("number-words").value = 0;
  document.getElementById("number-sentences").value = 0;
  document.getElementById("number-students").value = 0;
  document.getElementById("number-speak").value = 0;
  commentsInput.value = "";
  syncComments();
  document.getElementById("autosave-note").textContent = "";
  syncSpeakField(false);
  showStudentsMessage("");
  updateSessionDuration();
  saveState();
});

document.getElementById("session-start").addEventListener("input", updateSessionDuration);
document.getElementById("session-end").addEventListener("input", updateSessionDuration);
document.getElementById("number-words").addEventListener("input", updateChart);
document.getElementById("number-sentences").addEventListener("input", updateChart);

// Number of students: typed only (no arrows), digits only, 0-35.
const studentsInput = document.getElementById("number-students");
studentsInput.addEventListener("focus", () => studentsInput.select());
studentsInput.addEventListener("input", () => {
  let digits = studentsInput.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (digits !== "" && Number(digits) > STUDENTS_MAX) {
    digits = String(STUDENTS_MAX);
    showStudentsMessage(`The maximum number of students is ${STUDENTS_MAX}.`);
  } else {
    showStudentsMessage("");
  }
  studentsInput.value = digits;
  syncSpeakField(false);
  updateChart();
});
studentsInput.addEventListener("blur", () => {
  if (studentsInput.value === "") studentsInput.value = 0;
  syncSpeakField();
  updateChart();
});

// Number of students who speak: typed, arrows, or + / - keys. Never above the number of students.
const speakInput = document.getElementById("number-speak");
speakInput.addEventListener("focus", () => speakInput.select());
speakInput.addEventListener("input", () => { syncSpeakField(); updateChart(); });
speakInput.addEventListener("blur", () => {
  if (speakInput.value === "") speakInput.value = 0;
  syncSpeakField();
  updateChart();
});

// + and - adjust the count (also with the numeric keypad). They work anywhere on the page
// except while typing in another field; inside the "students who speak" field they replace typing a sign.
document.addEventListener("keydown", event => {
  if (event.key !== "+" && event.key !== "-") return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  const tag = target?.tagName?.toLowerCase();
  const typingElsewhere = ["input", "textarea", "select"].includes(tag) || target?.isContentEditable;
  if (typingElsewhere && target.id !== "number-speak") return;
  event.preventDefault();
  if (event.repeat) return;
  adjustStudentsWhoSpeak(event.key === "+" ? 1 : -1);
});

// ---- +/- buttons (words, sentences, students who speak) ----
document.querySelectorAll(".step-btn").forEach(button => {
  // Keep the focus where it is, so the + / - keyboard shortcut stays reserved for students who speak.
  button.addEventListener("mousedown", event => event.preventDefault());
  button.addEventListener("click", () => {
    // Leave any field being edited, so the + / - shortcut works right after a click.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const delta = Number(button.dataset.step);
    const targetId = button.dataset.stepTarget;
    if (targetId === "number-speak") {
      adjustStudentsWhoSpeak(delta);
    } else {
      document.getElementById(targetId).value = Math.max(0, Math.floor(getNumericValue(targetId)) + delta);
      updateChart();
    }
    saveState();
  });
});

// ---- Comments (auto-growing, mirrored for the PDF) ----
const commentsInput = document.getElementById("session-comments");
const commentsBlock = document.getElementById("comments-block");
const commentsPrint = document.getElementById("comments-print");

function autosizeComments() {
  commentsInput.style.height = "auto";
  commentsInput.style.height = `${commentsInput.scrollHeight + 2}px`;
}

function syncComments() {
  commentsPrint.textContent = commentsInput.value;
  commentsBlock.classList.toggle("is-empty", commentsInput.value.trim() === "");
  autosizeComments();
}

commentsInput.addEventListener("input", syncComments);
window.addEventListener("resize", autosizeComments);

// ---- Automatic save (browser localStorage) ----
const STORAGE_KEY = "peaps-session-v1";
let lastSavedState = "";

function collectState() {
  const now = Date.now();
  return {
    v: 1,
    title: document.getElementById("session-title").value,
    level: document.getElementById("session-level").value,
    start: document.getElementById("session-start").value,
    end: document.getElementById("session-end").value,
    words: document.getElementById("number-words").value,
    sentences: document.getElementById("number-sentences").value,
    students: document.getElementById("number-students").value,
    speak: document.getElementById("number-speak").value,
    comments: commentsInput.value,
    // A running timer is saved with its elapsed time so far; it is restored paused.
    timers: Object.fromEntries(TIMER_IDS.map(id => [id, Math.round(currentElapsed(id, now))])),
    wasRunning: TIMER_IDS.filter(id => timers[id].startedAt !== null)
  };
}

function isBlankState(state) {
  const numbersBlank = [state.words, state.sentences, state.students, state.speak]
    .every(value => value === "" || Number(value) === 0);
  const textBlank = [state.title, state.level, state.start, state.end, state.comments]
    .every(value => value === "");
  return numbersBlank && textBlank && TIMER_IDS.every(id => !state.timers[id]);
}

function saveState() {
  try {
    const state = collectState();
    if (isBlankState(state)) {
      localStorage.removeItem(STORAGE_KEY);
      lastSavedState = "";
      return;
    }
    const serialized = JSON.stringify(state);
    if (serialized === lastSavedState) return;
    localStorage.setItem(STORAGE_KEY, serialized);
    lastSavedState = serialized;
  } catch (error) {
    // Storage unavailable (private mode, blocked...): the app keeps working without auto-save.
  }
}

function restoreState() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    return;
  }
  if (!state || state.v !== 1 || isBlankState({ ...state, timers: state.timers || {} })) return;

  const setText = (id, value) => { document.getElementById(id).value = typeof value === "string" ? value : ""; };
  setText("session-title", state.title);
  setText("session-level", state.level);
  setText("session-start", state.start);
  setText("session-end", state.end);
  setText("session-comments", state.comments);

  const count = (value, max = Infinity) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? Math.min(number, max) : 0;
  };
  document.getElementById("number-words").value = count(state.words);
  document.getElementById("number-sentences").value = count(state.sentences);
  document.getElementById("number-students").value = count(state.students, STUDENTS_MAX);
  document.getElementById("number-speak").value = count(state.speak);
  syncSpeakField(false);

  TIMER_IDS.forEach(id => {
    const elapsed = Number(state.timers?.[id]);
    timers[id].elapsedMs = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
    timers[id].startedAt = null;
  });
  syncComments();

  const paused = Array.isArray(state.wasRunning) && state.wasRunning.length > 0;
  document.getElementById("autosave-note").textContent = paused
    ? "Previous session restored from the automatic save. Timers that were running have been paused."
    : "Previous session restored from the automatic save.";
  lastSavedState = JSON.stringify(state);
}

document.addEventListener("input", saveState);
document.addEventListener("change", saveState);
setInterval(saveState, 2000);
window.addEventListener("pagehide", saveState);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveState(); });

function updateExportState() {
  const start = document.getElementById("session-start").value;
  const end = document.getElementById("session-end").value;
  const duration = getSessionDurationMinutes();
  const valid = Boolean(start && end && duration > 0);
  document.getElementById("export-pdf").disabled = !valid;
  document.getElementById("export-message").textContent = valid
    ? "Your session is ready to export."
    : "Enter valid beginning and end times to export the session.";
}

document.getElementById("export-pdf").addEventListener("click", () => {
  const duration = getSessionDurationMinutes();
  if (!document.getElementById("session-start").value ||
      !document.getElementById("session-end").value || !duration || duration <= 0) {
    updateExportState();
    return;
  }
  TIMER_IDS.forEach(updateTimerUI);
  updateChart();
  window.print(); // Choose "Save as PDF" in the browser print dialog.
});

function refreshRunningDisplays() {
  TIMER_IDS.forEach(id => {
    if (timers[id].startedAt !== null) {
      document.getElementById(`display-${id}`).textContent = display(currentElapsed(id));
    }
  });
  updateChart();
  window.requestAnimationFrame(refreshRunningDisplays);
}

restoreState();
TIMER_IDS.forEach(updateTimerUI);
updateSessionDuration();
updateChart();
window.requestAnimationFrame(refreshRunningDisplays);
