/* Drink Around the World — Interactive Tracker
   - Saves to localStorage
   - Progress + pace + timer
   - Filters + search
   - Print/Save as PDF
*/

const COUNTRIES = [
  { key: "mexico",  name: "Mexico",  emoji: "🇲🇽", hint: "Strong cocktails early. Don’t sprint." },
  { key: "norway",  name: "Norway",  emoji: "🇳🇴", hint: "Sneaky strength. Hydration check." },
  { key: "china",   name: "China",   emoji: "🇨🇳", hint: "Sweet drinks can hit harder than you think." },
  { key: "germany", name: "Germany", emoji: "🇩🇪", hint: "Big beers & heavy pours. Food stop recommended." },
  { key: "italy",   name: "Italy",   emoji: "🇮🇹", hint: "This is where people go too hard. Slow down." },
  { key: "usa",     name: "America", emoji: "🇺🇸", hint: "Eat something. Don’t double up." },
  { key: "japan",   name: "Japan",   emoji: "🇯🇵", hint: "Clean flavors, strong pours. Water before moving on." },
  { key: "morocco", name: "Morocco", emoji: "🇲🇦", hint: "Sneaky cocktails. Hydrate." },
  { key: "france",  name: "France",  emoji: "🇫🇷", hint: "Champagne + heat = surprise knockout." },
  { key: "uk",      name: "UK",      emoji: "🇬🇧", hint: "Danger zone. If you’re wobbling, pause here." },
  { key: "canada",  name: "Canada",  emoji: "🇨🇦", hint: "Victory lap. You earned it." },
];

const STORAGE_KEY = "datw_tracker_v1";

const $list = document.getElementById("list");
const $tpl = document.getElementById("itemTpl");
const $completed = document.getElementById("completedCount");
const $paceLabel = document.getElementById("paceLabel");

const $btnReset = document.getElementById("btnReset");
const $btnPrint = document.getElementById("btnPrint");
const $btnCopy = document.getElementById("btnCopy");
const $copyStatus = document.getElementById("copyStatus");

const $btnStart = document.getElementById("btnStart");
const $btnStop = document.getElementById("btnStop");
const $btnHydrate = document.getElementById("btnHydrate");
const $elapsed = document.getElementById("elapsed");
const $hydrations = document.getElementById("hydrations");

const $search = document.getElementById("search");
const $chips = Array.from(document.querySelectorAll(".chip"));
const $routeBtns = Array.from(document.querySelectorAll(".routeBtn"));
const $routeHint = document.getElementById("routeHint");

let state = loadState();
let ui = { filter: "all", q: "" };

let timerInterval = null;

init();
renderAll();

function init() {
  // build list once
  $list.innerHTML = "";
  for (const c of COUNTRIES) {
    const node = $tpl.content.cloneNode(true);
    const card = node.querySelector(".item");
    card.dataset.key = c.key;

    node.querySelector(".country").textContent = c.name;
    node.querySelector(".hint").textContent = c.hint;
    node.querySelector(".flag").textContent = c.emoji;

    const $done = node.querySelector(".done");
    const $drink = node.querySelector(".drink");
    const $rating = node.querySelector(".rating");
    const $notes = node.querySelector(".notes");
    const $updated = node.querySelector(".updated");
    const $clear = node.querySelector(".clear");

    // fill from state
    const s = state.items[c.key] || defaultItem();
    $done.checked = !!s.done;
    $drink.value = s.drink || "";
    $rating.value = s.rating || "";
    $notes.value = s.notes || "";
    $updated.textContent = s.updatedAt ? fmtDateTime(s.updatedAt) : "—";

    // visual done state
    toggleDoneClass(card, $done.checked);

    // events
    $done.addEventListener("change", () => {
      updateItem(c.key, { done: $done.checked });
      toggleDoneClass(card, $done.checked);
    });

    $drink.addEventListener("input", debounce(() => updateItem(c.key, { drink: $drink.value }), 200));
    $rating.addEventListener("change", () => updateItem(c.key, { rating: $rating.value }));
    $notes.addEventListener("input", debounce(() => updateItem(c.key, { notes: $notes.value }), 250));

    $clear.addEventListener("click", () => {
      updateItem(c.key, { done: false, drink: "", rating: "", notes: "" }, true);
      $done.checked = false;
      $drink.value = "";
      $rating.value = "";
      $notes.value = "";
      $updated.textContent = "—";
      toggleDoneClass(card, false);
      renderStats();
    });

    $list.appendChild(node);
  }

  // buttons
  $btnReset.addEventListener("click", () => {
    if (!confirm("Reset EVERYTHING? This clears progress, notes, timer, and hydration count.")) return;
    state = freshState();
    saveState();
    // re-init UI from scratch
    stopTimer();
    init();
    renderAll();
  });

  $btnPrint.addEventListener("click", () => window.print());

  $btnCopy.addEventListener("click", async () => {
    const done = getCompletedCount();
    const route = state.route ? `Route: ${cap(state.route)}.` : "";
    const text = `I just did Drink Around the World ✅ (${done}/11 countries). ${route} Hydration breaks: ${state.hydrations || 0}.`;
    try {
      await navigator.clipboard.writeText(text);
      $copyStatus.textContent = "Copied! Paste it anywhere.";
      setTimeout(() => ($copyStatus.textContent = ""), 2500);
    } catch {
      $copyStatus.textContent = "Copy failed. (Your browser may block it.)";
      setTimeout(() => ($copyStatus.textContent = ""), 2500);
    }
  });

  // search + filters
  $search.value = "";
  $search.addEventListener("input", debounce(() => {
    ui.q = $search.value.trim().toLowerCase();
    applyFilters();
  }, 150));

  $chips.forEach(chip => {
    chip.addEventListener("click", () => {
      $chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      ui.filter = chip.dataset.filter;
      applyFilters();
    });
  });

  // route selection
  $routeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.route;
      state.route = r;
      saveState();
      setActiveRoute(r);
      renderStats();
      renderRouteHint();
    });
  });
  setActiveRoute(state.route || "");

  // timer
  $btnStart.addEventListener("click", startTimer);
  $btnStop.addEventListener("click", stopTimer);
  $btnHydrate.addEventListener("click", () => {
    state.hydrations = (state.hydrations || 0) + 1;
    saveState();
    renderTimer();
  });

  // restore timer if running
  renderRouteHint();
  renderTimer();
  renderStats();
  applyFilters();
}

function defaultItem() {
  return { done: false, drink: "", rating: "", notes: "", updatedAt: null };
}

function freshState() {
  const items = {};
  for (const c of COUNTRIES) items[c.key] = defaultItem();
  return {
    items,
    route: "",
    hydrations: 0,
    timer: { running: false, startedAt: null, elapsedMs: 0 }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);

    // migrate/ensure keys exist
    const base = freshState();
    const merged = {
      ...base,
      ...parsed,
      items: { ...base.items, ...(parsed.items || {}) }
    };
    // ensure all country keys exist
    for (const c of COUNTRIES) {
      merged.items[c.key] = { ...defaultItem(), ...(merged.items[c.key] || {}) };
    }
    return merged;
  } catch {
    return freshState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateItem(key, patch, silentUpdatedAt = false) {
  const item = state.items[key] || defaultItem();
  const updatedAt = silentUpdatedAt ? item.updatedAt : Date.now();
  state.items[key] = { ...item, ...patch, updatedAt };
  saveState();
  // update "last updated" in DOM
  const card = document.querySelector(`.item[data-key="${key}"]`);
  if (card && !silentUpdatedAt) {
    const u = card.querySelector(".updated");
    if (u) u.textContent = fmtDateTime(updatedAt);
  }
  renderStats();
  applyFilters(false); // keep scroll stable
}

function getCompletedCount() {
  return COUNTRIES.reduce((acc, c) => acc + (state.items[c.key]?.done ? 1 : 0), 0);
}

function renderStats() {
  const done = getCompletedCount();
  $completed.textContent = String(done);

  // Pace is heuristic: based on elapsed time per completed country
  const ms = getElapsedMs();
  const hrs = ms / 3600000;
  const pace = (done > 0 && hrs > 0) ? (hrs / done) : null; // hours per country
  $paceLabel.textContent = paceLabel(pace, state.route);

  renderTimer();
}

function paceLabel(hoursPerCountry, route) {
  if (!state.timer?.running && getElapsedMs() === 0) return "—";
  if (!hoursPerCountry) return "Starting…";

  // route adjusts “ideal” pace
  let ideal = 0.35; // ~21 min per country baseline
  if (route === "light") ideal = 0.30;
  if (route === "medium") ideal = 0.35;
  if (route === "heavy") ideal = 0.42;

  if (hoursPerCountry <= ideal * 0.75) return "Too fast ⚠️";
  if (hoursPerCountry <= ideal * 1.15) return "On pace ✅";
  if (hoursPerCountry <= ideal * 1.6) return "Slow & steady 👍";
  return "Very slow 🐢";
}

function toggleDoneClass(card, isDone) {
  card.classList.toggle("doneState", isDone);
}

function applyFilters(shouldRenderStats = true) {
  const q = ui.q;
  const filter = ui.filter;

  for (const c of COUNTRIES) {
    const card = document.querySelector(`.item[data-key="${c.key}"]`);
    if (!card) continue;

    const item = state.items[c.key] || defaultItem();
    const matchesText = !q || c.name.toLowerCase().includes(q);

    let matchesFilter = true;
    if (filter === "done") matchesFilter = !!item.done;
    if (filter === "open") matchesFilter = !item.done;

    card.style.display = (matchesText && matchesFilter) ? "" : "none";
  }

  if (shouldRenderStats) renderStats();
}

function setActiveRoute(route) {
  $routeBtns.forEach(b => b.classList.toggle("active", b.dataset.route === route));
}

function renderRouteHint() {
  const r = state.route;
  if (!r) {
    $routeHint.textContent = "No route selected. (Optional)";
    return;
  }
  if (r === "light") $routeHint.textContent = "Light: beer/wine pace. Easier to finish all 11.";
  if (r === "medium") $routeHint.textContent = "Medium: mixed drinks + beer/wine. Pace matters.";
  if (r === "heavy") $routeHint.textContent = "Heavy: cocktails. Mandatory water + food stops.";
}

function renderAll() {
  renderStats();
  renderRouteHint();
  renderTimer();
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  state.timer.startedAt = Date.now();
  saveState();

  $btnStart.disabled = true;
  $btnStop.disabled = false;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 500);
  renderTimer();
}

function stopTimer() {
  if (!state.timer.running) return;
  const now = Date.now();
  const delta = now - (state.timer.startedAt || now);
  state.timer.elapsedMs = (state.timer.elapsedMs || 0) + Math.max(0, delta);
  state.timer.running = false;
  state.timer.startedAt = null;
  saveState();

  $btnStart.disabled = false;
  $btnStop.disabled = true;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  renderTimer();
}

function getElapsedMs() {
  const base = state.timer.elapsedMs || 0;
  if (!state.timer.running) return base;
  const now = Date.now();
  const delta = now - (state.timer.startedAt || now);
  return base + Math.max(0, delta);
}

function renderTimer() {
  // sync timer buttons
  $btnStart.disabled = !!state.timer.running;
  $btnStop.disabled = !state.timer.running;

  const ms = getElapsedMs();
  $elapsed.textContent = fmtDuration(ms);
  $hydrations.textContent = String(state.hydrations || 0);
}

function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}

function fmtDateTime(ts) {
  try {
    const d = new Date(ts);
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${mm} ${ampm}`;
  } catch {
    return "—";
  }
}

function cap(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
