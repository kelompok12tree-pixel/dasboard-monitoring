import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

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

let currentAgg = "minute";
let historiData = [];

// charts
let chartWindLive, chartRainLive, chartLuxLive;
let chartWindRekap, chartRainRekap, chartLuxRekap;

// ===== Tab utama
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

// ===== Utils waktu
function parseToDate(str) {
  if (!str || typeof str !== "string") return null;
  const [dp, tp] = str.split(" ");
  if (!dp || !tp) return null;
  const [y, m, d] = dp.split("-").map(Number);
  const [hh, mm, ss] = tp.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}
function pad2(n) { return n.toString().padStart(2, "0"); }

// ===== Tap tooltip plugin (sinkron 3 chart)
function makeTapTooltipPlugin(getCharts) {
  return {
    id: "tapTooltip",
    afterEvent(chart, args) {
      const e = args.event;
      if (!e) return;
      if (e.type !== "click" && e.type !== "touchend") return;

      const points = chart.getElementsAtEventForMode(
        e.native,
        "nearest",
        { intersect: false }, // mudah di HP [web:117]
        true
      );

      const charts = getCharts().filter(Boolean);

      if (!points.length) {
        charts.forEach(ch => {
          ch.setActiveElements([]);
          ch.tooltip?.setActiveElements([], { x: 0, y: 0 });
          ch.update();
        });
        return;
      }

      const idx = points[0].index;
      charts.forEach(ch => {
        const area = ch.chartArea;
        ch.setActiveElements([{ datasetIndex: 0, index: idx }]);
        ch.tooltip.setActiveElements(
          [{ datasetIndex: 0, index: idx }],
          { x: (area.left + area.right) / 2, y: area.top + 20 }
        ); // programmatic tooltip [web:105]
        ch.update();
      });
    }
  };
}

const tapPluginLive = makeTapTooltipPlugin(() => [chartWindLive, chartRainLive, chartLuxLive]);
const tapPluginRekap = makeTapTooltipPlugin(() => [chartWindRekap, chartRainRekap, chartLuxRekap]);

// ===== Chart helper
function makeLineChart(canvasId, label, color, tapPlugin) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: "rgba(255,255,255,0)",
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 18
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false }, // [web:117]
      plugins: {
        legend: { labels: { color: "#e5e7eb", boxWidth: 10 } },
        tooltip: {
          callbacks: {
            title: (items) => items?.[0]?.label ?? "", // [web:106]
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: "#9ca3af", maxRotation: 45, minRotation: 45 } },
        y: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(156,163,175,0.2)" } }
      },
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "touchend"]
    },
    plugins: tapPlugin ? [tapPlugin] : []
  });
}

function pushPoint(chart, label, value, maxPoints = 24) {
  if (!chart) return;
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > maxPoints) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update("none");
}

// ===== Init charts
function initCharts() {
  chartWindLive = makeLineChart("chart-wind-live", "Angin (km/h)", "#22c55e", tapPluginLive);
  chartRainLive = makeLineChart("chart-rain-live", "Hujan Harian (mm)", "#38bdf8", tapPluginLive);
  chartLuxLive  = makeLineChart("chart-lux-live",  "Cahaya (lux)", "#fbbf24", tapPluginLive);
}

// ===== Realtime listener
const realtimeRef = ref(db, "/weather/keadaan_sekarang");
onValue(realtimeRef, snap => {
  const val = snap.val();
  if (!val) return;

  const wind = Number(val.anemometer || 0);
  const rain = Number(val.rain_gauge || 0);
  const lux  = Number(val.sensor_cahaya || 0);
  const timeStr = val.waktu || "-";

  cardWind.textContent = wind.toFixed(2);
  cardRain.textContent = rain.toFixed(2);
  cardLux.textContent  = lux.toFixed(1);
  cardTime.textContent = timeStr;
  if (statusBanner) statusBanner.textContent = "Connected - Last update: " + timeStr;

  pushPoint(chartWindLive, timeStr, wind, 24);
  pushPoint(chartRainLive, timeStr, rain, 24);
  pushPoint(chartLuxLive,  timeStr, lux,  24);
});

// ===== Histori listener
const histRef = ref(db, "/weather/histori");
onValue(histRef, snap => {
  const val = snap.val();
  historiData = [];

  if (val) {
    Object.keys(val).forEach(k => {
      const row = val[k];
      if (!row || !row.waktu) return;
      const d = parseToDate(row.waktu);
      if (!d) return;
      historiData.push({
        time: d,
        timeStr: row.waktu,
        wind: Number(row.anemometer || 0),
        rain: Number(row.rain_gauge || 0),
        lux:  Number(row.sensor_cahaya || 0)
      });
    });
    historiData.sort((a, b) => a.time - b.time);
  }

  updateRekapView();
});

// ===== Agregasi histori
function aggregateData(data, mode) {
  const map = new Map();

  data.forEach(item => {
    const d = item.time;
    let key, label;

    if (mode === "minute") {
      key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      label = key;
    } else if (mode === "hour") {
      key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}`;
      label = key + ":00";
    } else if (mode === "day") {
      key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
      label = key;
    } else {
      key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
      label = key;
    }

    if (!map.has(key)) map.set(key, { label, count:0, windSum:0, rainSum:0, luxSum:0 });
    const b = map.get(key);
    b.count++;
    b.windSum += item.wind;
    b.rainSum += item.rain;
    b.luxSum  += item.lux;
  });

  const buckets = Array.from(map.values()).map(b => ({
    label: b.label,
    wind: b.windSum / b.count,
    rain: b.rainSum / b.count,
    lux:  b.luxSum  / b.count
  }));

  buckets.sort((a,b)=>a.label.localeCompare(b.label));
  return buckets;
}

function buildRekapChart(canvasId, label, color, labels, data, tapPlugin) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas.getContext("2d"), {
    type: (currentAgg === "month" ? "bar" : "line"),
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color + "55",
        tension: 0.3,
        borderWidth: 2,
        pointRadius: (currentAgg === "month" ? 2 : 0),
        pointHitRadius: 18
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false }, // [web:117]
      plugins: {
        legend: { labels: { color: "#e5e7eb", boxWidth: 10 } },
        tooltip: {
          callbacks: {
            title: (items) => items?.[0]?.label ?? "",
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: "#9ca3af", maxRotation: 45, minRotation: 45 } },
        y: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(156,163,175,0.2)" } }
      },
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "touchend"]
    },
    plugins: tapPlugin ? [tapPlugin] : []
  });
}

// ===== Update rekap
function updateRekapView() {
  if (!rekapInfo || !rekapTbody) return;

  if (!historiData.length) {
    rekapInfo.textContent = "Belum ada data histori.";
    rekapTbody.innerHTML = "";
    chartWindRekap?.destroy(); chartRainRekap?.destroy(); chartLuxRekap?.destroy();
    return;
  }

  const buckets = aggregateData(historiData, currentAgg);
  rekapInfo.textContent = `Mode: ${currentAgg.toUpperCase()} | Total grup: ${buckets.length}`;

  // tabel
  rekapTbody.innerHTML = "";
  buckets.slice().reverse().forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>${row.wind.toFixed(2)}</td>
      <td>${row.rain.toFixed(2)}</td>
      <td>${row.lux.toFixed(1)}</td>
    `;
    rekapTbody.appendChild(tr);
  });

  const labels = buckets.map(b => b.label);
  const windData = buckets.map(b => b.wind);
  const rainData = buckets.map(b => b.rain);
  const luxData  = buckets.map(b => b.lux);

  chartWindRekap?.destroy(); chartRainRekap?.destroy(); chartLuxRekap?.destroy();

  chartWindRekap = buildRekapChart("chart-wind-rekap", "Angin (km/h)", "#22c55e", labels, windData, tapPluginRekap);
  chartRainRekap = buildRekapChart("chart-rain-rekap", "Hujan (mm)", "#38bdf8", labels, rainData, tapPluginRekap);
  chartLuxRekap  = buildRekapChart("chart-lux-rekap",  "Cahaya (lux)", "#fbbf24", labels, luxData,  tapPluginRekap);
}

// ===== Download CSV
btnDownload?.addEventListener("click", () => {
  if (!historiData.length) return;
  const buckets = aggregateData(historiData, currentAgg);

  let csv = "Waktu,Wind(km/h),Rain(mm),Lux(lux)\n";
  buckets.forEach(b => {
    csv += `${b.label},${b.wind.toFixed(2)},${b.rain.toFixed(2)},${b.lux.toFixed(1)}\n`;
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

window.addEventListener("DOMContentLoaded", initCharts);
