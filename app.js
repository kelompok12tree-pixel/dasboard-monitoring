import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

// Firebase proyekmu (ambil dari file kamu sebelumnya)
const firebaseConfig = {
  apiKey: "AIzaSyD-eCZun9Chghk2z0rdPrEuIKkMojrM5g0",
  authDomain: "monitoring-ver-j.firebaseapp.com",
  databaseURL: "https://monitoring-ver-j-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "monitoring-ver-j",
  storageBucket: "monitoring-ver-j.firebasestorage.app",
  messagingSenderId: "237639687534",
  appId: "1:237639687534:web:4e61c13e6537455c34757f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM
const tabRealtime = document.getElementById("tab-realtime");
const tabRecap = document.getElementById("tab-recap");
const sectionRealtime = document.getElementById("section-realtime");
const sectionRecap = document.getElementById("section-recap");

const statusBanner = document.getElementById("status-banner");
const cardWind = document.getElementById("card-wind");
const cardRain = document.getElementById("card-rain");
const cardLux = document.getElementById("card-lux");
const cardTime = document.getElementById("card-time");

const subTabButtons = document.querySelectorAll(".tab-btn.sub");
const rekapInfo = document.getElementById("rekap-info");
const rekapTbody = document.getElementById("rekap-tbody");
const btnDownload = document.getElementById("btn-download");

const dateStartEl = document.getElementById("date-start");
const dateEndEl = document.getElementById("date-end");
const btnFilter = document.getElementById("btn-filter");
const btnClear = document.getElementById("btn-clear");
const btnGotoStart = document.getElementById("btn-goto-start");
const btnGotoEnd = document.getElementById("btn-goto-end");

let currentAgg = "minute";
let historiRaw = [];
let historiFiltered = [];

// charts
let chartWindLive, chartRainLive, chartLuxLive;
let chartWindRekap, chartRainRekap, chartLuxRekap;

// ===== Tabs
tabRealtime?.addEventListener("click", () => {
  tabRealtime.classList.add("active");
  tabRecap.classList.remove("active");
  sectionRealtime.classList.add("active");
  sectionRecap.classList.remove("active");
});
tabRecap?.addEventListener("click", () => {
  tabRecap.classList.add("active");
  tabRealtime.classList.remove("active");
  sectionRecap.classList.add("active");
  sectionRealtime.classList.remove("active");
});

// ===== Sub tab rekap
subTabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    subTabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentAgg = btn.dataset.agg;
    updateRekapView();
  });
});

// ===== Utils waktu (format dari data kamu sebelumnya)
function parseToDate(str) {
  if (!str || typeof str !== "string") return null;
  const [dp, tp] = str.split(" ");
  if (!dp || !tp) return null;
  const [y, m, d] = dp.split("-").map(Number);
  const [hh, mm, ss] = tp.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}
function pad2(n) { return n.toString().padStart(2, "0"); }
function toYMD(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function fmtAxis(d){
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth()+1);
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${dd}/${mm} ${hh}:${mi}`;
}
function fmtTooltip(d){
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

// ===== Chart factory (TANPA zoom/pan/drag)
function makeTimeChart(canvasId, title, color, unit, digits = 2) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      datasets: [{
        label: title,
        data: [], // {x: Date, y: number}
        borderColor: color,
        backgroundColor: color + "22",
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 14
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { labels: { color: "#e5e7eb", font: { size: 14, weight: "700" } } },
        tooltip: {
          titleFont: { size: 14, weight: "700" },
          bodyFont: { size: 14 },
          callbacks: {
            title: (items) => {
              const x = items?.[0]?.parsed?.x;
              return x ? fmtTooltip(new Date(x)) : "";
            },
            label: (ctx) => `${title}: ${Number(ctx.parsed.y).toFixed(digits)} ${unit}`
          }
        }
      },
      scales: {
        x: {
          type: "time",
          ticks: {
            color: "#cbd5e1",
            font: { size: 12, weight: "700" },
            maxTicksLimit: 6,
            callback: (v) => fmtAxis(new Date(v))
          },
          grid: { color: "rgba(148,163,184,.12)" }
        },
        y: {
          ticks: {
            color: "#cbd5e1",
            font: { size: 12, weight: "700" },
            callback: (v) => Number(v).toFixed(digits)
          },
          grid: { color: "rgba(148,163,184,.12)" }
        }
      }
    }
  });
}

function initCharts() {
  chartWindLive = makeTimeChart("chart-wind-live", "Angin", "#22c55e", "km/h", 2);
  chartRainLive = makeTimeChart("chart-rain-live", "Hujan Harian", "#38bdf8", "mm", 2);
  chartLuxLive  = makeTimeChart("chart-lux-live",  "Cahaya", "#fbbf24", "lux", 1);
}

function pushXY(chart, xDate, yVal, maxPoints = 120) {
  if (!chart) return;
  const ds = chart.data.datasets[0];
  ds.data.push({ x: xDate, y: yVal });
  if (ds.data.length > maxPoints) ds.data.shift();
  chart.update("none");
}

// ===== Filter tanggal
function applyDateFilter() {
  if (!historiRaw.length) { historiFiltered = []; return; }
  const s = dateStartEl.value ? new Date(dateStartEl.value + "T00:00:00") : null;
  const e = dateEndEl.value ? new Date(dateEndEl.value + "T23:59:59") : null;
  historiFiltered = historiRaw.filter(it => {
    if (s && it.time < s) return false;
    if (e && it.time > e) return false;
    return true;
  });
}

// ===== Agregasi
function aggregateData(data, mode) {
  const map = new Map();
  data.forEach(item => {
    const d = item.time;
    let keyDate;
    if (mode === "minute") keyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0);
    else if (mode === "hour") keyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0);
    else if (mode === "day") keyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    else keyDate = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);

    const key = keyDate.getTime();
    if (!map.has(key)) map.set(key, { x: keyDate, n: 0, w: 0, r: 0, l: 0 });
    const b = map.get(key);
    b.n++;
    b.w += item.wind;
    b.r += item.rain;
    b.l += item.lux;
  });

  const buckets = Array.from(map.values()).map(b => ({
    x: b.x,
    wind: b.w / b.n,
    rain: b.r / b.n,
    lux:  b.l / b.n
  }));

  buckets.sort((a, b) => a.x - b.x);
  return buckets;
}

function rebuildRekapCharts(points) {
  if (chartWindRekap) chartWindRekap.destroy();
  if (chartRainRekap) chartRainRekap.destroy();
  if (chartLuxRekap) chartLuxRekap.destroy();

  chartWindRekap = makeTimeChart("chart-wind-rekap", "Angin", "#22c55e", "km/h", 2);
  chartRainRekap = makeTimeChart("chart-rain-rekap", "Hujan", "#38bdf8", "mm", 2);
  chartLuxRekap  = makeTimeChart("chart-lux-rekap",  "Cahaya", "#fbbf24", "lux", 1);

  chartWindRekap.data.datasets[0].data = points.map(p => ({ x: p.x, y: p.wind }));
  chartRainRekap.data.datasets[0].data = points.map(p => ({ x: p.x, y: p.rain }));
  chartLuxRekap.data.datasets[0].data  = points.map(p => ({ x: p.x, y: p.lux }));

  chartWindRekap.update();
  chartRainRekap.update();
  chartLuxRekap.update();
}

function updateRekapView() {
  if (!rekapInfo || !rekapTbody) return;

  applyDateFilter();
  if (!historiFiltered.length) {
    rekapInfo.textContent = "Tidak ada data pada rentang tanggal tersebut.";
    rekapTbody.innerHTML = "";
    if (chartWindRekap) chartWindRekap.destroy();
    if (chartRainRekap) chartRainRekap.destroy();
    if (chartLuxRekap) chartLuxRekap.destroy();
    return;
  }

  const points = aggregateData(historiFiltered, currentAgg);
  rekapInfo.textContent = `Showing ${points.length} points (${currentAgg})`;
  rebuildRekapCharts(points);

  // tabel 200 terakhir
  rekapTbody.innerHTML = "";
  const rows = points.slice().reverse().slice(0, 200);
  rows.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.x.toLocaleString("id-ID")}</td>
      <td>${p.wind.toFixed(2)}</td>
      <td>${p.rain.toFixed(2)}</td>
      <td>${p.lux.toFixed(1)}</td>
    `;
    rekapTbody.appendChild(tr);
  });
}

function initButtons() {
  btnFilter?.addEventListener("click", updateRekapView);
  btnClear?.addEventListener("click", () => {
    dateStartEl.value = "";
    dateEndEl.value = "";
    historiFiltered = historiRaw.slice();
    updateRekapView();
  });

  btnGotoStart?.addEventListener("click", () => {
    if (!dateStartEl.value) return;
    // hanya scroll ke atas chart rekap (tanpa zoom/geser)
    document.getElementById("chart-wind-rekap")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  btnGotoEnd?.addEventListener("click", () => {
    if (!dateEndEl.value) return;
    document.getElementById("rekap-tbody")?.scrollIntoView({ behavior: "smooth", block: "end" });
  });

  btnDownload?.addEventListener("click", () => {
    applyDateFilter();
    if (!historiFiltered.length) return;
    const points = aggregateData(historiFiltered, currentAgg);

    let csv = "Waktu,Wind(km/h),Rain(mm),Lux(lux)\n";
    points.forEach(p => {
      csv += `${p.x.toISOString()},${p.wind.toFixed(2)},${p.rain.toFixed(2)},${p.lux.toFixed(1)}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-${currentAgg}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ===== Firebase listeners
function initFirebase() {
  const realtimeRef = ref(db, "weather/keadaan_sekarang");
  onValue(realtimeRef, snap => {
    const val = snap.val();
    if (!val) return;

    const wind = Number(val.anemometer || 0);
    const rain = Number(val.raingauge || 0);
    const lux  = Number(val.sensorcahaya || 0);

    const timeStr = val.waktu || "-";
    const dt = parseToDate(timeStr);
    if (!dt) return;

    cardWind.textContent = wind.toFixed(2);
    cardRain.textContent = rain.toFixed(2);
    cardLux.textContent = lux.toFixed(1);
    cardTime.textContent = timeStr;

    statusBanner.textContent = `Connected - Last update ${timeStr}`;

    pushXY(chartWindLive, dt, wind, 120);
    pushXY(chartRainLive, dt, rain, 120);
    pushXY(chartLuxLive,  dt, lux, 120);
  });

  const histRef = ref(db, "weather/histori");
  onValue(histRef, snap => {
    const val = snap.val();
    historiRaw = [];

    if (val) {
      Object.keys(val).forEach(k => {
        const row = val[k];
        if (!row || !row.waktu) return;

        const d = parseToDate(row.waktu);
        if (!d) return;

        historiRaw.push({
          time: d,
          timeStr: row.waktu,
          wind: Number(row.anemometer || 0),
          rain: Number(row.raingauge || 0),
          lux:  Number(row.sensorcahaya || 0)
        });
      });
    }

    historiRaw.sort((a, b) => a.time - b.time);

    if (historiRaw.length) {
      const first = historiRaw[0].time;
      const last  = historiRaw[historiRaw.length - 1].time;
      if (!dateStartEl.value) dateStartEl.value = toYMD(first);
      if (!dateEndEl.value) dateEndEl.value = toYMD(last);
    }

    historiFiltered = historiRaw.slice();
    updateRekapView();
  });
}

// ===== init
window.addEventListener("DOMContentLoaded", () => {
  initCharts();
  initButtons();
  initFirebase();
});
