const GOAL = 7000;
const REFRESH_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
let currentValue = 0;

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function setClock() {
  const now = new Date();
  $("time").textContent = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  $("date").textContent = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem("dojoFacebookHistory") || "[]"); }
  catch { return []; }
}

function saveHistory(value) {
  const today = new Date().toISOString().slice(0, 10);
  let history = getHistory();
  const existing = history.find((item) => item.date === today);

  if (existing) existing.value = value;
  else history.push({ date: today, value });

  history = history.slice(-30);
  localStorage.setItem("dojoFacebookHistory", JSON.stringify(history));
  return history;
}

function calculateDelta(history, days) {
  if (history.length < 2) return 0;
  const latest = history[history.length - 1].value;
  const compare = history[Math.max(0, history.length - 1 - days)]?.value ?? latest;
  return latest - compare;
}

function displayDelta(id, value) {
  const sign = value > 0 ? "+" : "";
  $(id).textContent = `${sign}${formatNumber(value)}`;
  $(id).style.color = value >= 0 ? "var(--green)" : "var(--red)";
}

function animateCounter(target) {
  const start = currentValue || target;
  const duration = 950;
  const startedAt = performance.now();

  function step(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const value = Math.round(start + (target - start) * eased);
    $("counter").textContent = formatNumber(value);

    if (progress < 1) requestAnimationFrame(step);
    else {
      currentValue = target;
      $("counter").classList.remove("bump");
      void $("counter").offsetWidth;
      $("counter").classList.add("bump");
    }
  }

  requestAnimationFrame(step);
}

function drawChart(history) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (history.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.font = "28px sans-serif";
    ctx.fillText("Le graphique se remplira automatiquement jour après jour.", 40, 135);
    return;
  }

  const values = history.map((item) => item.value);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const pad = 34;

  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = pad + ((h - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  const points = values.map((value, i) => {
    const x = pad + ((w - pad * 2) / Math.max(values.length - 1, 1)) * i;
    const y = h - pad - ((value - min) / Math.max(max - min, 1)) * (h - pad * 2);
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#e5252a");
  gradient.addColorStop(1, "#2290ff");

  ctx.shadowColor = "rgba(34,144,255,.65)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  ctx.shadowBlur = 0;
  points.forEach((p) => {
    ctx.fillStyle = "#2290ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
  });
}
function celebrateNewFollower(gain) {
  const toast = $("newFollowerToast");
  const confettiLayer = $("confettiLayer");

  toast.textContent = gain > 1
    ? `🎉 ${gain} nouveaux abonnés !`
    : "🎉 Nouvel abonné !";

  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  document.body.classList.remove("new-follower-flash");
  void document.body.offsetWidth;
  document.body.classList.add("new-follower-flash");

  const colors = ["#2290ff", "#e5252a", "#ffffff", "#22c55e"];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * .4 + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    confettiLayer.appendChild(piece);

    setTimeout(() => piece.remove(), 3200);
  }
}
async function fetchFacebook() {
  try {
    const response = await fetch("/api/facebook", { cache: "no-store" });
    const data = await response.json();

    if (!data.ok) throw new Error(data.message || "API indisponible");

    $("status").textContent = "● En direct";
    $("status").className = "status live";

    const followers = Number(data.followers);
   if (currentValue && followers > currentValue) {
  celebrateNewFollower(followers - currentValue);
}

animateCounter(followers);

    $("updatedAt").textContent = new Date(data.updatedAt).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const history = saveHistory(followers);
    displayDelta("todayDelta", calculateDelta(history, 1));
    displayDelta("weekDelta", calculateDelta(history, 7));

    const percent = Math.min(Math.round((followers / GOAL) * 100), 100);
    $("goalPercent").textContent = `${percent}%`;
    $("goalBar").style.width = `${percent}%`;

    drawChart(history);
  } catch (error) {
    $("status").textContent = "● Hors ligne";
    $("status").className = "status offline";
    $("updatedAt").textContent = "API indisponible";
    const history = getHistory();
    const last = history.at(-1)?.value || 0;
    if (last) animateCounter(last);
    drawChart(history);
  }
}

setClock();
setInterval(setClock, 1000);
fetchFacebook();
setInterval(fetchFacebook, REFRESH_MS);
