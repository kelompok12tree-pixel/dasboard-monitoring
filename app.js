import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

// Firebase proyekmu
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
const cardLux  = document.getElementById("card-lux");
const cardTime = document.getElementById("card-time");

const subTabButtons = document.querySelectorAll(".tab-btn.sub");
const rekapInfo = document.getElementById("rekap-info");
const rekapTbody = document.getElementById("rekap-tbody");
const btnDownload = document.getElementById("btn-download");

const dateStartEl = document.getElementById("date-start");
const dateEndEl   = document.getElementById("date-end");
const btnFilter   = document.getElementById("btn-filter");
const btnClear    = document.getElementById("btn-clear");
const btnGotoStart = document.getElementById("btn-goto-start");
const btnGotoEnd   = document.getElementById("btn-goto-end");
const btnSlide     = document.getElementById("btn-slide");

let currentAgg = "minute";
let historiRaw = [];
let historiFiltered = [];

// charts
let chartWindLive, chartRainLive, chartLuxLive;
let chartWindRekap, chartRainRekap, chartLuxRekap;

// pinned tooltip state
const pinned = new Map();

// ===== Tabs
tabRealtime.addEventListener("click", () => {
  tabRealtime.classList.add("active");
  tabRecap.classList.remove("active");
  sectionRealtime.classList.add("active");
  sectionRecap.classList.remove("active");
});
tabRecap.addEventListener("click", () => {
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

// ===== Utils waktu
function parseToDate(str) {
  const [dp, tp] = str.split(" ");
  if (!dp || !tp) return null;
  const [y, m, d] = dp.split("-").map(Number);
  const [hh, mm, ss] = tp.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}
function pad2(n) { return n.toString().padStart(2, "0"); }
function toYMD(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

// ===== Plugin: klik/tap untuk "pin" tooltip
const pinTooltipPlugin = {
  id: "pinTooltip",
  afterEvent(chart, args) {
    const e = args.event;
    if (!e) return;

    if (e.type === "click") {
      const points = chart.getElementsAtEventForMode(e.native, "nearest", { intersect: true }, true);
      if (points.length) {
        const p = points[0];
        pinned.set(chart, { datasetIndex: p.datasetIndex, index: p.index });
        chart.setActiveElements([{ datasetIndex: p.datasetIndex, index: p.index }]);
        chart.tooltip.setActiveElements([{ datasetIndex: p.datasetIndex, index: p.index }], { x: e.x, y: e.y });
        chart.update();
      }
    }
  }
};

// ===== Chart factory (time scale + zoom)
function makeTimeChart(canvasId, title, color, unit, digits=2) {
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
            label: (ctx) => `${title}: ${Number(ctx.parsed.y).toFixed(digits)} ${unit}`
          }
        },
        zoom: {
          pan: { enabled: false, mode: "x", modifierKey: "ctrl" }, // OFF default [web:283]
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag:  { enabled: true },
            mode: "x"
          }
        }
      },
      scales: {
        x: {
          type: "time", // supaya waktu tidak numpuk [web:297]
          time: {
            displayFormats: {
              minute: "HH:mm",
              hour: "HH:mm",
              day: "dd/MM",
              month: "MM/yyyy"
            }
          },
          ticks: {
            color: "#cbd5e1",
            font: { size: 12, weight: "700" },
            maxTicksLimit: 7
          },
          grid: { color: "rgba(148,163,184,.12)" }
        },
        y: {
          ticks: {
            color: "#cbd5e1",
            font: { size: 12, weight: "700" },
            callback: (v)=>Number(v).toFixed(digits)
          },
          grid: { color: "rgba(148,163,184,.12)" }
        }
      }
    },
    plugins: [pinTooltipPlugin]
  });
}

// ===== Init charts
function initCharts() {
  chartWindLive = makeTimeChart("chart-wind-live", "Angin", "#22c55e", "km/h", 2);
  chartRainLive = makeTimeChart("chart-rain-live", "Hujan Harian", "#38bdf8", "mm", 2);
  chartLuxLive  = makeTimeChart("chart-lux-live",  "Cahaya", "#fbbf24", "lux", 1);
}

// ===== Push live
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

// ===== Agregasi histori
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
    if (!map.has(key)) map.set(key, { x: keyDate, n:0, w:0, r:0, l:0 });
    const b = map.get(key);
    b.n++; b.w += item.wind; b.r += item.rain; b.l += item.lux;
  });

  const buckets = Array.from(map.values()).map(b => ({
    x: b.x,
    wind: b.w / b.n,
    rain: b.r / b.n,
    lux:  b.l / b.n
  }));
  buckets.sort((a,b)=>a.x-b.x);
  return buckets;
}

// ===== Fokus tanggal + tooltip angka (Ke Mulai/Ke Akhir)
function findNearestIndex(points, targetDate){
  if (!points.length) return -1;
  let best = 0;
  let bestDiff = Math.abs(points[0].x - targetDate);
  for (let i = 1; i < points.length; i++){
    const diff = Math.abs(points[i].x - targetDate);
    if (diff < bestDiff){ bestDiff = diff; best = i; }
  }
  return best;
}

function focusDateOnCharts(targetDate){
  applyDateFilter();
  const points = aggregateData(historiFiltered, currentAgg);
  if (!points.length) return;

  const idx = findNearestIndex(points, targetDate);
  if (idx < 0) return;

  // window fokus
  const spanMs = Math.max(60 * 60 * 1000, (points[points.length - 1].x - points[0].x) / 8);
  const minX = new Date(targetDate.getTime() - spanMs);
  const maxX = new Date(targetDate.getTime() + spanMs);

  const applyTo = (chart) => {
    if (!chart) return;
    chart.options.scales.x.min = minX;
    chart.options.scales.x.max = maxX;

    // tampilkan tooltip angka di titik idx (programmatic tooltip) [web:320]
    chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: chart.chartArea.left + 20, y: chart.chartArea.top + 20 });
    chart.update();
  };

  applyTo(chartWindRekap);
  applyTo(chartRainRekap);
  applyTo(chartLuxRekap);

  document.getElementById("chart-wind-rekap")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ===== Rebuild chart rekap
function rebuildRekapCharts(points) {
  if (chartWindRekap) chartWindRekap.destroy();
  if (chartRainRekap) chartRainRekap.destroy();
  if (chartLuxRekap)  chartLuxRekap.destroy();

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

// ===== Update rekap view
function updateRekapView() {
  if (!rekapInfo || !rekapTbody) return;

  applyDateFilter();

  if (!historiFiltered.length) {
    rekapInfo.textContent = "Tidak ada data pada rentang tanggal tersebut.";
    rekapTbody.innerHTML = "";
    if (chartWindRekap) chartWindRekap.destroy();
    if (chartRainRekap) chartRainRekap.destroy();
    if (chartLuxRekap)  chartLuxRekap.destroy();
    return;
  }

  const points = aggregateData(historiFiltered, currentAgg);
  rekapInfo.textContent = `Showing ${points.length} points (${currentAgg})`;

  rebuildRekapCharts(points);

  // tabel (200 terakhir)
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

// ===== Slide mode (pan ON/OFF)
let slideMode = false;

function setSlideMode(enabled){
  slideMode = enabled;

  const apply = (chart) => {
    if (!chart?.options?.plugins?.zoom) return;
    chart.options.plugins.zoom.pan.enabled = enabled;                 // [web:283]
    chart.options.plugins.zoom.pan.modifierKey = enabled ? null : "ctrl"; // [web:283]
    chart.update();
  };

  apply(chartWindLive); apply(chartRainLive); apply(chartLuxLive);
  apply(chartWindRekap); apply(chartRainRekap); apply(chartLuxRekap);

  if (btnSlide) btnSlide.textContent = `Slide: ${enabled ? "ON" : "OFF"}`;
}

// ===== Buttons init
function initButtons() {
  // reset zoom
  document.querySelectorAll("[data-reset]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.reset;
      const map = {
        windLive: chartWindLive, rainLive: chartRainLive, luxLive: chartLuxLive,
        windRekap: chartWindRekap, rainRekap: chartRainRekap, luxRekap: chartLuxRekap
      };
      const ch = map[key];
      if (ch && typeof ch.resetZoom === "function") ch.resetZoom();
    });
  });

  // unpin
  document.querySelectorAll("[data-unpin]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.unpin;
      const map = {
        windLive: chartWindLive, rainLive: chartRainLive, luxLive: chartLuxLive,
        windRekap: chartWindRekap, rainRekap: chartRainRekap, luxRekap: chartLuxRekap
      };
      const ch = map[key];
      if (!ch) return;
      pinned.delete(ch);
      ch.setActiveElements([]);
      ch.update();
    });
  });

  btnFilter?.addEventListener("click", () => updateRekapView());

  btnClear?.addEventListener("click", () => {
    dateStartEl.value = "";
    dateEndEl.value = "";
    historiFiltered = historiRaw.slice();
    updateRekapView();
  });

  btnGotoStart?.addEventListener("click", () => {
    if (!dateStartEl.value) return;
    focusDateOnCharts(new Date(dateStartEl.value + "T12:00:00"));
  });

  btnGotoEnd?.addEventListener("click", () => {
    if (!dateEndEl.value) return;
    focusDateOnCharts(new Date(dateEndEl.value + "T12:00:00"));
  });

  btnSlide?.addEventListener("click", () => setSlideMode(!slideMode));
}

// ===== Firebase listeners
const realtimeRef = ref(db, "/weather/keadaan_sekarang");
onValue(realtimeRef, snap => {
  const val = snap.val();
  if (!val) return;

  const wind = Number(val.anemometer || 0);
  const rain = Number(val.rain_gauge || 0);
  const lux  = Number(val.sensor_cahaya || 0);
  const timeStr = val.waktu || "-";
  const dt = parseToDate(timeStr);
  if (!dt) return;

  cardWind.textContent = wind.toFixed(2);
  cardRain.textContent = rain.toFixed(2);
  cardLux.textContent  = lux.toFixed(1);
  cardTime.textContent = timeStr;
  statusBanner.textContent = "Connected - Last update: " + timeStr;

  pushXY(chartWindLive, dt, wind, 120);
  pushXY(chartRainLive, dt, rain, 120);
  pushXY(chartLuxLive,  dt, lux,  120);
});

const histRef = ref(db, "/weather/histori");
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
        rain: Number(row.rain_gauge || 0),
        lux:  Number(row.sensor_cahaya || 0)
      });
    });
    historiRaw.sort((a, b) => a.time - b.time);
  }

  if (historiRaw.length) {
    const first = historiRaw[0].time;
    const last  = historiRaw[historiRaw.length - 1].time;
    if (!dateStartEl.value) dateStartEl.value = toYMD(first);
    if (!dateEndEl.value)   dateEndEl.value   = toYMD(last);
  }

  historiFiltered = historiRaw.slice();
  updateRekapView();
});

// ===== CSV
btnDownload?.addEventListener("click", () => {
  applyDateFilter();
  if (!historiFiltered.length) return;
  const points = aggregateData(historiFiltered, currentAgg);

  let csv = "Waktu,Wind(km/h),Rain(mm),Lux(lux)\n";
  points.forEach(p => {
    csv += `${p.x.toISOString()},${p.wind.toFixed(2)},${p.rain.toFixed(2)},${p.lux.toFixed(1)}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap_${currentAgg}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// init
window.addEventListener("DOMContentLoaded", () => {
  initCharts();
  initButtons();
  setSlideMode(false);
});
