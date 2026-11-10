const TIMER_IDS = ["understanding", "production", "interaction"];
const HOTKEYS = { "1": "understanding", "2": "production", "3": "interaction" };
const WORDS_REFERENCE = 15;      // maximum for "number of new words"
const SENTENCES_REFERENCE = 8;   // maximum for "number of new sentences"
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

  // New words / new sentences use fixed scales (15 and 8), capped at 100%.
  const values = [
    ...timerRatios,
    Math.min(words / WORDS_REFERENCE, 1),
    Math.min(sentences / SENTENCES_REFERENCE, 1)
  ];

  const center = { x: 300, y: 260 };
  const radius = 175;
  const vertices = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + i * (2 * Math.PI / 5);
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
}

function startTimer(id) {
  if (timers[id].startedAt !== null) return;
  timers[id].startedAt = Date.now();
  updateTimerUI(id);
}

function pauseTimer(id) {
  const timer = timers[id];
  if (timer.startedAt === null) return;
  timer.elapsedMs += Date.now() - timer.startedAt;
  timer.startedAt = null;
  updateTimerUI(id);
  updateChart();
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
  document.getElementById("number-words").value = 0;
  document.getElementById("number-sentences").value = 0;
  updateChart();
});

document.getElementById("session-start").addEventListener("input", updateSessionDuration);
document.getElementById("session-end").addEventListener("input", updateSessionDuration);
document.getElementById("number-words").addEventListener("input", updateChart);
document.getElementById("number-sentences").addEventListener("input", updateChart);

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

TIMER_IDS.forEach(updateTimerUI);
updateSessionDuration();
updateChart();
window.requestAnimationFrame(refreshRunningDisplays);
