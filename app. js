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

const rekapInfo = document.getElementById("rekap-info");
const rekapTbody = document.getElementById("rekap-tbody");
const btnDownload = document.getElementById("btn-download");
const subTabButtons = document.querySelectorAll(".tab-btn.sub");

// state
let currentAgg = "minute";
let historiRaw = [];

let chartWindRekap, chartRainRekap, chartLuxRekap;
const pinned = new Map();

// Tabs (opsional)
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

// Menit/Jam/Hari/Bulan
subTabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    subTabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentAgg = btn.dataset.agg;
    updateRekapView();
  });
});

// waktu (format: "YYYY-MM-DD HH:mm:ss")
function parseToDate(str) {
  if (!str || typeof str !== "string") return null;
  const [dp, tp] = str.split(" ");
  if (!dp || !tp) return null;
  const [y, m, d] = dp.split("-").map(Number);
  const [hh, mm, ss] = tp.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}
function pad2(n){ return n.toString().padStart(2, "0"); }
function fmtAxis(d){
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtTooltipTime(d){
  return d.toLocaleString("id-ID", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
}

// Tap/click untuk pin tooltip (berdasarkan konsep plugin kamu sebelumnya)
const pinTooltipPlugin = {
  id: "pinTooltip",
  afterEvent(chart, args) {
    const e = args.event;
    if (!e) return;

    if (e.type === "click" || e.type === "touchend") {
      const points = chart.getElementsAtEventForMode(
        e.native,
        "nearest",
        { intersect: false }, // lebih mudah di HP
        true
      );

      if (points.length) {
        const p = points[0];
        pinned.set(chart, { datasetIndex: p.datasetIndex, index: p.index });

        chart.setActiveElements([{ datasetIndex: p.datasetIndex, index: p.index }]);
        chart.tooltip.setActiveElements(
          [{ datasetIndex: p.datasetIndex, index: p.index }],
          { x: e.x, y: e.y }
        );
        chart.update();
      }
    }
  }
};

function makeTimeChart(canvasId, title, color, unit, digits = 2) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      datasets: [{
        label: title,
        data: [],
        borderColor: color,
        backgroundColor: color + "22",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 22
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { labels: { color: "#e5e7eb", font: { size: 12, weight: "800" } } },
        tooltip: {
          titleFont: { size: 13, weight: "800" },
          bodyFont: { size: 13 },
          callbacks: {
            title: (items) => {
              const x = items?.[0]?.parsed?.x;
              return x ? fmtTooltipTime(new Date(x)) : "";
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
            font: { size: 11, weight: "700" },
            maxTicksLimit: 7,
            callback: (v) => fmtAxis(new Date(v))
          },
          grid: { color: "rgba(148,163,184,.12)" }
        },
        y: {
          ticks: {
            color: "#cbd5e1",
            font: { size: 11, weight: "700" },
            callback: (v) => Number(v).toFixed(digits)
          },
          grid: { color: "rgba(148,163,184,.12)" }
        }
      }
    },
    plugins: [pinTooltipPlugin]
  });
}

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

function rebuildCharts(points) {
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
  const points = aggregateData(historiRaw, currentAgg);
  if (rekapInfo) rekapInfo.textContent = `Mode: ${currentAgg.toUpperCase()} | Total grup: ${points.length}`;

  rebuildCharts(points);

  if (rekapTbody) {
    rekapTbody.innerHTML = "";
    const rows = points.slice().reverse().slice(0, 200);
    rows.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTooltipTime(p.x)}</td>
        <td>${p.wind.toFixed(2)}</td>
        <td>${p.rain.toFixed(2)}</td>
        <td>${p.lux.toFixed(1)}</td>
      `;
      rekapTbody.appendChild(tr);
    });
  }
}

// CSV
btnDownload?.addEventListener("click", () => {
  const points = aggregateData(historiRaw, currentAgg);
  let csv = "Waktu,Angin(km/h),Hujan(mm),Cahaya(lux)\n";
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

// Firebase histori
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
        wind: Number(row.anemometer || 0),
        rain: Number(row.raingauge || 0),
        lux:  Number(row.sensorcahaya || 0)
      });
    });
  }

  historiRaw.sort((a,b)=>a.time-b.time);
  updateRekapView();
});
