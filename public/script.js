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
  }).toUpperCase();
}

function displayDelta(id, value) {
  const sign = value > 0 ? "+" : "";
  $(id).textContent = `${sign}${formatNumber(value)}`;
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
    $("totalFollowers").textContent = formatNumber(value);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      currentValue = target;
      $("counter").classList.remove("bump");
      void $("counter").offsetWidth;
      $("counter").classList.add("bump");
    }
  }

  requestAnimationFrame(step);
}

function calculateMonth(history, followers) {
  if (!Array.isArray(history) || history.length < 2) return 0;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  const firstOfMonth = history.find(item => item.date.startsWith(currentMonth));
  if (!firstOfMonth) return 0;

  return followers - Number(firstOfMonth.value || followers);
}

function drawChart(history) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!Array.isArray(history) || history.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "30px sans-serif";
    ctx.fillText("Le graphique se remplira automatiquement jour après jour.", 45, 150);
    return;
  }

  const values = history.map(item => Number(item.value));
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const pad = 56;

  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 6; i++) {
    const y = pad + ((h - pad * 2) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();

    const label = Math.round(max - ((max - min) / 5) * i);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "22px sans-serif";
    ctx.fillText(formatNumber(label), 0, y + 8);
  }

  const points = values.map((value, i) => {
    const x = pad + ((w - pad * 2) / Math.max(values.length - 1, 1)) * i;
    const y = h - pad - ((value - min) / Math.max(max - min, 1)) * (h - pad * 2);
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#ff2638");
  gradient.addColorStop(.45, "#b333ff");
  gradient.addColorStop(1, "#1593ff");

  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(points.at(-1).x, h - pad);
  ctx.lineTo(points[0].x, h - pad);
  ctx.closePath();

  const fillGradient = ctx.createLinearGradient(0, pad, 0, h);
  fillGradient.addColorStop(0, "rgba(21,147,255,.45)");
  fillGradient.addColorStop(1, "rgba(21,147,255,0)");
  ctx.fillStyle = fillGradient;
  ctx.fill();

  ctx.shadowColor = "rgba(21,147,255,.8)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  ctx.shadowBlur = 0;

  points.forEach((p, i) => {
    ctx.fillStyle = i < points.length / 3 ? "#ff2638" : "#1593ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
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

  const colors = ["#1593ff", "#ff2638", "#ffffff", "#24f57a", "#a638ff"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * .45 + "s";
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

    const followers = Number(data.followers || 0);

    $("status").textContent = "● EN DIRECT";
    $("status").className = "status live";

    if (currentValue && followers > currentValue) {
      celebrateNewFollower(followers - currentValue);
    }

    animateCounter(followers);

    const today = Number(data.today || 0);
    const week = Number(data.week || 0);
    const history = Array.isArray(data.history) ? data.history : [];
    const month = calculateMonth(history, followers);

    displayDelta("todayDelta", today);
    displayDelta("weekDelta", week);
    displayDelta("monthDelta", month);

    const percent = Math.min(Math.round((followers / GOAL) * 100), 100);
    const remaining = Math.max(GOAL - followers, 0);

    $("goalPercentCircle").textContent = `${percent}%`;
    $("remainingFollowers").textContent = formatNumber(remaining);

    drawChart(history);

  } catch (error) {
    $("status").textContent = "● HORS LIGNE";
    $("status").className = "status offline";
    console.error(error);
  }
}

setClock();
setInterval(setClock, 1000);

fetchFacebook();
setInterval(fetchFacebook, REFRESH_MS);

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "t") {
    celebrateNewFollower(1);
    animateCounter(currentValue + 1);

    setTimeout(() => {
      animateCounter(currentValue);
    }, 5000);
  }
});
