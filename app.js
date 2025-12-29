/* World Showcase Survivor — Interactive Tracker
   - 11 countries
   - 2 popular choices per country + where to order
   - Complete + notes + autosave
   - Timer + hydration + pace
   - Unlock badge modal at 11/11
*/

const STORAGE_KEY = "wss_tracker_v2";

const COUNTRIES = [
  {
    key:"mexico", name:"Mexico", emoji:"🇲🇽",
    where:"Outdoor tequila bar / beverage window",
    choices:["Margarita","Mexican Beer"]
  },
  {
    key:"norway", name:"Norway", emoji:"🇳🇴",
    where:"Norway bar / drink kiosk",
    choices:["Aquavit Cocktail","Norwegian Beer"]
  },
  {
    key:"china", name:"China", emoji:"🇨🇳",
    where:"Tea stand / drink kiosk",
    choices:["Frozen Cocktail (tea-style)","Plum Wine"]
  },
  {
    key:"germany", name:"Germany", emoji:"🇩🇪",
    where:"Beer cart / biergarten",
    choices:["Grapefruit Beer","Traditional Lager"]
  },
  {
    key:"italy", name:"Italy", emoji:"🇮🇹",
    where:"Beverage cart / wine window",
    choices:["Limoncello Cocktail","Italian Wine"]
  },
  {
    key:"usa", name:"United States", emoji:"🇺🇸",
    where:"American bar / smokehouse bar",
    choices:["Bourbon Cocktail","Craft Beer"]
  },
  {
    key:"japan", name:"Japan", emoji:"🇯🇵",
    where:"Sake bar / drink counter",
    choices:["Frozen Sake Cocktail","Japanese Beer"]
  },
  {
    key:"morocco", name:"Morocco", emoji:"🇲🇦",
    where:"Morocco bar / beverage kiosk",
    choices:["Citrus Cocktail","Sangria-style Wine"]
  },
  {
    key:"france", name:"France", emoji:"🇫🇷",
    where:"Champagne bar / outdoor cart",
    choices:["Champagne","Frozen Wine Cocktail"]
  },
  {
    key:"uk", name:"United Kingdom", emoji:"🇬🇧",
    where:"UK pub bar",
    choices:["Cider","English Beer"]
  },
  {
    key:"canada", name:"Canada", emoji:"🇨🇦",
    where:"Canada beverage cart",
    choices:["Apple-based Cocktail","Canadian Beer"]
  },
];

const $list = document.getElementById("list");
const $tpl = document.getElementById("countryTpl");

const $doneCount = document.getElementById("doneCount");
const $bar = document.getElementById("bar");
const $pace = document.getElementById("pace");
const $hydrations = document.getElementById("hydrations");
const $elapsed = document.getElementById("elapsed");

const $btnReset = document.getElementById("btnReset");
const $btnPrint = document.getElementById("btnPrint");

const $btnStart = document.getElementById("btnStart");
const $btnStop = document.getElementById("btnStop");
const $btnHydrate = document.getElementById("btnHydrate");

const $search = document.getElementById("search");
const $chips = Array.from(document.querySelectorAll(".chip"));

const $modal = document.getElementById("modal");
const $btnClose = document.getElementById("btnClose");
const $btnCopy = document.getElementById("btnCopy");
const $copyStatus = document.getElementById("copyStatus");

let state = loadState();
let ui = { filter:"all", q:"" };
let timerInterval = null;

init();
renderAll();

function init(){
  renderList();

  $btnPrint.addEventListener("click", () => window.print());

  $btnReset.addEventListener("click", () => {
    if(!confirm("Reset EVERYTHING? This clears progress, notes, timer, and hydration.")) return;
    state = freshState();
    saveState();
    stopTimer(true);
    renderList();
    renderAll();
  });

  $btnStart.addEventListener("click", startTimer);
  $btnStop.addEventListener("click", () => stopTimer(false));
  $btnHydrate.addEventListener("click", () => {
    state.hydrations = (state.hydrations || 0) + 1;
    saveState();
    renderStats();
  });

  $search.addEventListener("input", debounce(() => {
    ui.q = $search.value.trim().toLowerCase();
    applyFilters();
  }, 120));

  $chips.forEach(ch => {
    ch.addEventListener("click", () => {
      $chips.forEach(x => x.classList.remove("active"));
      ch.classList.add("active");
      ui.filter = ch.dataset.filter;
      applyFilters();
    });
  });

  $btnClose.addEventListener("click", hideModal);
  $modal.addEventListener("click", (e) => {
    if(e.target === $modal) hideModal();
  });

  $btnCopy.addEventListener("click", async () => {
    const txt = makeShareText();
    try{
      await navigator.clipboard.writeText(txt);
      $copyStatus.textContent = "Copied. Paste it in your caption 👇";
      setTimeout(()=>($copyStatus.textContent=""), 2500);
    }catch{
      $copyStatus.textContent = "Copy failed (browser blocked).";
      setTimeout(()=>($copyStatus.textContent=""), 2500);
    }
  });

  // restore timer if it was running
  if(state.timer?.running){
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(renderStats, 500);
  }
}

function renderList(){
  $list.innerHTML = "";

  for(const c of COUNTRIES){
    const node = $tpl.content.cloneNode(true);
    const card = node.querySelector(".country");
    card.dataset.key = c.key;

    node.querySelector(".flag").textContent = c.emoji;
    node.querySelector(".name").textContent = c.name;
    node.querySelector(".where").textContent = `Where to order: ${c.where}`;

    const choiceBtns = node.querySelectorAll(".choiceBtn");
    choiceBtns[0].textContent = `🍹 ${c.choices[0]}`;
    choiceBtns[1].textContent = `🍺 ${c.choices[1]}`;

    const $drink = node.querySelector(".drink");
    const $notes = node.querySelector(".notes");
    const $status = node.querySelector(".status");
    const $complete = node.querySelector(".completeBtn");
    const $clear = node.querySelector(".clearBtn");

    const item = state.items[c.key] || defaultItem();
    $drink.value = item.drink || "";
    $notes.value = item.notes || "";
    setDoneUI(card, item.done);
    $status.textContent = item.done ? `✅ Completed • ${fmtTime(item.updatedAt)}` : `Not completed`;

    choiceBtns[0].addEventListener("click", () => {
      $drink.value = c.choices[0];
      updateItem(c.key, { drink: $drink.value });
    });
    choiceBtns[1].addEventListener("click", () => {
      $drink.value = c.choices[1];
      updateItem(c.key, { drink: $drink.value });
    });

    $drink.addEventListener("input", debounce(() => updateItem(c.key, { drink: $drink.value }), 150));
    $notes.addEventListener("input", debounce(() => updateItem(c.key, { notes: $notes.value }), 180));

    $complete.addEventListener("click", () => {
      const current = state.items[c.key] || defaultItem();
      const nowDone = !current.done;
      updateItem(c.key, { done: nowDone });
      setDoneUI(card, nowDone);

      const updated = state.items[c.key];
      $status.textContent = nowDone ? `✅ Completed • ${fmtTime(updated.updatedAt)}` : `Not completed`;

      renderAll();
      maybeUnlockBadge();
    });

    $clear.addEventListener("click", () => {
      updateItem(c.key, { done:false, drink:"", notes:"" }, true);
      $drink.value = "";
      $notes.value = "";
      setDoneUI(card, false);
      $status.textContent = "Not completed";
      renderAll();
    });

    $list.appendChild(node);
  }

  applyFilters();
}

function setDoneUI(card, done){
  card.classList.toggle("done", !!done);
}

function defaultItem(){
  return { done:false, drink:"", notes:"", updatedAt:null };
}

function freshState(){
  const items = {};
  for(const c of COUNTRIES) items[c.key] = defaultItem();
  return {
    items,
    hydrations: 0,
    badgeUnlocked: false,
    timer: { running:false, startedAt:null, elapsedMs: 0 }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return freshState();
    const parsed = JSON.parse(raw);

    const base = freshState();
    const merged = { ...base, ...parsed, items: { ...base.items, ...(parsed.items||{}) } };

    for(const c of COUNTRIES){
      merged.items[c.key] = { ...defaultItem(), ...(merged.items[c.key] || {}) };
    }
    return merged;
  }catch{
    return freshState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateItem(key, patch, silentUpdatedAt=false){
  const item = state.items[key] || defaultItem();
  const updatedAt = silentUpdatedAt ? item.updatedAt : Date.now();
  state.items[key] = { ...item, ...patch, updatedAt };
  saveState();
}

function getDoneCount(){
  return COUNTRIES.reduce((acc,c)=> acc + (state.items[c.key]?.done ? 1 : 0), 0);
}

function renderAll(){
  renderStats();
  applyFilters(false);
}

function renderStats(){
  const done = getDoneCount();
  $doneCount.textContent = String(done);
  $hydrations.textContent = String(state.hydrations || 0);

  const pct = Math.round((done/11)*100);
  $bar.style.width = `${pct}%`;

  const ms = getElapsedMs();
  $elapsed.textContent = fmtDuration(ms);

  // Pace heuristic: minutes per completed country
  if(ms === 0) {
    $pace.textContent = "—";
  } else if(done === 0){
    $pace.textContent = "Starting…";
  } else {
    const minPer = (ms/60000) / done;
    if(minPer < 18) $pace.textContent = "Too fast ⚠️";
    else if(minPer < 35) $pace.textContent = "On pace ✅";
    else if(minPer < 55) $pace.textContent = "Slow & steady 👍";
    else $pace.textContent = "Very slow 🐢";
  }
}

function applyFilters(updateStats=true){
  const q = ui.q;
  const filter = ui.filter;

  for(const c of COUNTRIES){
    const card = document.querySelector(`.country[data-key="${c.key}"]`);
    if(!card) continue;

    const item = state.items[c.key] || defaultItem();
    const matchText = !q || c.name.toLowerCase().includes(q);

    let matchFilter = true;
    if(filter === "done") matchFilter = !!item.done;
    if(filter === "open") matchFilter = !item.done;

    card.style.display = (matchText && matchFilter) ? "" : "none";
  }

  if(updateStats) renderStats();
}

function maybeUnlockBadge(){
  const done = getDoneCount();
  if(done === 11 && !state.badgeUnlocked){
    state.badgeUnlocked = true;
    saveState();
    showModal();
  }
}

function showModal(){
  $modal.classList.add("show");
  $modal.setAttribute("aria-hidden","false");
}
function hideModal(){
  $modal.classList.remove("show");
  $modal.setAttribute("aria-hidden","true");
}

function makeShareText(){
  const ms = getElapsedMs();
  const time = fmtDuration(ms);
  const hyd = state.hydrations || 0;
  return `WORLD SHOWCASE SURVIVOR ✅ 11/11 • Time: ${time} • Hydration breaks: ${hyd} 🍻🌍 #WorldShowcaseSurvivor`;
}

/* Timer */
function startTimer(){
  if(state.timer.running) return;
  state.timer.running = true;
  state.timer.startedAt = Date.now();
  saveState();

  $btnStart.disabled = true;
  $btnStop.disabled = false;

  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(renderStats, 500);
  renderStats();
}

function stopTimer(hard){
  if(!state.timer.running && !hard) return;

  if(state.timer.running){
    const now = Date.now();
    const delta = now - (state.timer.startedAt || now);
    state.timer.elapsedMs = (state.timer.elapsedMs || 0) + Math.max(0, delta);
  }

  state.timer.running = false;
  state.timer.startedAt = null;
  if(hard) state.timer.elapsedMs = 0;
  saveState();

  $btnStart.disabled = false;
  $btnStop.disabled = true;

  if(timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  renderStats();
}

function getElapsedMs(){
  const base = state.timer.elapsedMs || 0;
  if(!state.timer.running) return base;
  const now = Date.now();
  const delta = now - (state.timer.startedAt || now);
  return base + Math.max(0, delta);
}

/* Helpers */
function fmtDuration(ms){
  const total = Math.floor(ms/1000);
  const m = Math.floor(total/60);
  const s = total % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function fmtTime(ts){
  if(!ts) return "";
  const d = new Date(ts);
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2,"0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}
function debounce(fn, wait){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), wait);
  };
}