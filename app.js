
const TIMER_IDS = ["understanding", "production", "interaction"];

const timers = Object.fromEntries(
  TIMER_IDS.map((id) => [
    id,
    {
      startedAt: null,
      elapsedMs: 0
    }
  ])
);

// Convertit les millisecondes en affichage MM:SS ou HH:MM:SS
const display = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};


// Calcule le temps écoulé, y compris si le chronomètre fonctionne
function currentElapsed(id, now = Date.now()) {
  const timer = timers[id];

  return timer.elapsedMs +
    (timer.startedAt === null ? 0 : now - timer.startedAt);
}


// Met à jour l'affichage d'un chronomètre
function updateTimerUI(id) {
  const timer = timers[id];

  const running = timer.startedAt !== null;

  document.getElementById(`display-${id}`).textContent =
    display(currentElapsed(id));

  document.getElementById(`total-${id}`).textContent =
    display(timer.elapsedMs);

  document.querySelector(
    `[data-action="start"][data-target="${id}"]`
  ).disabled = running;

  document.querySelector(
    `[data-action="pause"][data-target="${id}"]`
  ).disabled = !running;

  document.getElementById(`status-${id}`).textContent =
    running
      ? "Running"
      : (timer.elapsedMs > 0 ? "Paused" : "Ready");
}


// Met à jour le graphique radar
function updateChart() {

  const values = TIMER_IDS.map(
    (id) => timers[id].elapsedMs
  );

  // La valeur maximale détermine l'échelle du radar
  const maxValue = Math.max(...values, 1000);

  const center = {
    x: 250,
    y: 220
  };

  // Les trois sommets du triangle
  const vertices = [
    { x: 250, y: 65 },
    { x: 95, y: 335 },
    { x: 405, y: 335 }
  ];

  // Calcule les sommets intermédiaires
  const pointsFor = (factor) => {

    return vertices.map((vertex) => ({
      x: center.x + (vertex.x - center.x) * factor,
      y: center.y + (vertex.y - center.y) * factor
    }));

  };

  // Construction de la grille du radar
  const grid = document.getElementById("radar-grid");

  grid.innerHTML = "";

  // Quatre niveaux de référence
  [0.25, 0.5, 0.75, 1].forEach((factor) => {

    const points = pointsFor(factor)
      .map((p) => `${p.x},${p.y}`)
      .join(" ");

    const polygon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon"
    );

    polygon.setAttribute("points", points);

    grid.appendChild(polygon);

  });

  // Lignes reliant le centre aux trois sommets
  vertices.forEach((vertex) => {

    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );

    line.setAttribute("x1", center.x);
    line.setAttribute("y1", center.y);

    line.setAttribute("x2", vertex.x);
    line.setAttribute("y2", vertex.y);

    grid.appendChild(line);

  });

  // Calcul des trois points correspondant aux temps cumulés
  const dataPoints = vertices.map((vertex, index) => {

    const factor = values[index] / maxValue;

    return {
      x: center.x + (vertex.x - center.x) * factor,
      y: center.y + (vertex.y - center.y) * factor
    };

  });

  // Mise à jour de la surface colorée du radar
  document.getElementById("radar-data").setAttribute(
    "points",
    dataPoints
      .map((p) => `${p.x},${p.y}`)
      .join(" ")
  );

  // Mise à jour des valeurs affichées à côté du graphique
  TIMER_IDS.forEach((id) => {

    document.getElementById(`chart-${id}`).textContent =
      display(timers[id].elapsedMs);

  });

}


// Démarre un chronomètre
function startTimer(id) {

  const timer = timers[id];

  if (timer.startedAt !== null) return;

  timer.startedAt = Date.now();

  updateTimerUI(id);

}


// Met en pause un chronomètre et ajoute le temps au cumul
function pauseTimer(id) {

  const timer = timers[id];

  if (timer.startedAt === null) return;

  timer.elapsedMs += Date.now() - timer.startedAt;

  timer.startedAt = null;

  updateTimerUI(id);

  // Chaque pause actualise le graphique
  updateChart();

}


// Gestion des boutons START
document.querySelectorAll(
  "[data-action='start']"
).forEach((button) => {

  button.addEventListener("click", () => {

    startTimer(button.dataset.target);

  });

});


// Gestion des boutons PAUSE
document.querySelectorAll(
  "[data-action='pause']"
).forEach((button) => {

  button.addEventListener("click", () => {

    pauseTimer(button.dataset.target);

  });

});


// Bouton RESET SESSION
document.getElementById("reset-button").addEventListener(
  "click",
  () => {

    const anyRunning = TIMER_IDS.some(
      (id) => timers[id].startedAt !== null
    );

    if (
      anyRunning &&
      !window.confirm(
        "A timer is still running. Reset all timers anyway?"
      )
    ) {
      return;
    }

    TIMER_IDS.forEach((id) => {

      timers[id].startedAt = null;

      timers[id].elapsedMs = 0;

      updateTimerUI(id);

    });

    updateChart();

  }
);


// Actualisation continue des chronomètres en fonctionnement
function refreshRunningDisplays() {

  TIMER_IDS.forEach((id) => {

    if (timers[id].startedAt !== null) {

      document.getElementById(`display-${id}`).textContent =
        display(currentElapsed(id));

    }

  });

  window.requestAnimationFrame(refreshRunningDisplays);

}


// Initialisation des trois chronomètres
TIMER_IDS.forEach(updateTimerUI);

// Initialisation du graphique
updateChart();

// Lancement de l'actualisation des affichages
window.requestAnimationFrame(refreshRunningDisplays);
