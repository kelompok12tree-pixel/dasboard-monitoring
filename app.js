import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

// KONFIGURASI FIREBASE PUNYAMU
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

let currentAgg = "minute";
let realtimeChart;
let rekapChart;
let historiData = [];

// TAB UTAMA
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

// SUB TAB REKAP
subTabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    subTabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentAgg = btn.dataset.agg;
    updateRekapView();
  });
});

// REALTIME
const realtimeRef = ref(db, "/weather/keadaan_sekarang");
onValue(realtimeRef, snap => {
  const val = snap.val();
  if (!val) return;

  const wind = Number(val.anemometer || 0);
  const rain = Number(val.rain_gauge || 0);
  const lux = Number(val.sensor_cahaya || 0);
  const timeStr = val.waktu || "-";

  cardWind.textContent = wind.toFixed(2);
  cardRain.textContent = rain.toFixed(2);
  cardLux.textContent = lux.toFixed(1);
  cardTime.textContent = timeStr;
  statusBanner.textContent = "Data realtime tersambung. Terakhir: " + timeStr;

  pushRealtimeChart(timeStr, wind, rain, lux);
});

// HISTORI
const histRef = ref(db, "/weather/histori");
onValue(histRef, snap => {
  const val = snap.val();
  historiData = [];
  if (val) {
    Object.keys(val).forEach(k => {
      const row = val[k];
      if (!row) return;
      const tStr = row.waktu || null;
      if (!tStr) return;
      const d = parseToDate(tStr);
      if (!d) return;
      historiData.push({
        time: d,
        timeStr: tStr,
        wind: Number(row.anemometer || 0),
        rain: Number(row.rain_gauge || 0),
        lux: Number(row.sensor_cahaya || 0)
      });
    });
    historiData.sort((a, b) => a.time - b.time);
  }
  updateRekapView();
});

// UTIL WAKTU
function parseToDate(str) {
  const [dp, tp] = str.split(" ");
  if (!dp || !tp) return null;
  const [y, m, d] = dp.split("-").map(Number);
  const [hh, mm, ss] = tp.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

// REALTIME CHART
function initRealtimeChart() {
  const ctx = document.getElementById("chart-realtime").getContext("2d");
  realtimeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Angin (km/h)",
          data: [],
          borderColor: "#f97316",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Curah Hujan (mm)",
          data: [],
          borderColor: "#38bdf8",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Cahaya (lux)",
          data: [],
          borderColor: "#a855f7",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#9ca3af", maxRotation: 0 } },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(156,163,175,0.2)" }
        }
      },
      plugins: {
        legend: { labels: { color: "#e5e7eb", boxWidth: 10 } }
      }
    }
  });
}

function pushRealtimeChart(label, wind, rain, lux) {
  if (!realtimeChart) return;
  const maxPoints = 24;
  realtimeChart.data.labels.push(label);
  realtimeChart.data.datasets[0].data.push(wind);
  realtimeChart.data.datasets[1].data.push(rain);
  realtimeChart.data.datasets[2].data.push(lux);
  if (realtimeChart.data.labels.length > maxPoints) {
    realtimeChart.data.labels.shift();
    realtimeChart.data.datasets.forEach(ds => ds.data.shift());
  }
  realtimeChart.update("none");
}

// AGREGASI HISTORI
function aggregateData(data, mode) {
  const map = new Map();
  data.forEach(item => {
    const d = item.time;
    let key, label;
    if (mode === "minute") {
      key =
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
        `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      label = key;
    } else if (mode === "hour") {
      key =
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
        `${pad2(d.getHours())}`;
      label = key + ":00";
    } else if (mode === "day") {
      key =
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      label = key;
    } else {
      key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      label = key;
    }

    if (!map.has(key)) {
      map.set(key, { label, count: 0, windSum: 0, rainSum: 0, luxSum: 0 });
    }
    const b = map.get(key);
    b.count++;
    b.windSum += item.wind;
    b.rainSum += item.rain;
    b.luxSum += item.lux;
  });

  const buckets = Array.from(map.values()).map(b => ({
    label: b.label,
    wind: b.windSum / b.count,
    rain: b.rainSum / b.count,
    lux: b.luxSum / b.count
  }));

  buckets.sort((a, b) => a.label.localeCompare(b.label));

  let labelName = "Per Menit";
  if (mode === "hour") labelName = "Per Jam";
  else if (mode === "day") labelName = "Per Hari";
  else if (mode === "month") labelName = "Per Bulan";
  return { buckets, labelName };
}

// UPDATE REKAP
function updateRekapView() {
  if (!historiData.length) {
    rekapInfo.textContent = "Belum ada data histori.";
    rekapTbody.innerHTML = "";
    if (rekapChart) rekapChart.destroy();
    return;
  }

  const { buckets, labelName } = aggregateData(historiData, currentAgg);
  rekapInfo.textContent = `Mode: ${labelName} | Total grup: ${buckets.length}`;

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
  const luxData = buckets.map(b => b.lux);

  if (rekapChart) rekapChart.destroy();
  const ctx = document.getElementById("chart-rekap").getContext("2d");
  const type = currentAgg === "month" ? "bar" : "line";

  rekapChart = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [
        {
          label: "Angin (km/h)",
          data: windData,
          borderColor: "#f97316",
          backgroundColor: "rgba(249,115,22,0.5)",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: type === "line" ? 0 : 2
        },
        {
          label: "Curah Hujan (mm)",
          data: rainData,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.5)",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: type === "line" ? 0 : 2
        },
        {
          label: "Cahaya (lux)",
          data: luxData,
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,0.5)",
          tension: 0.3,
          borderWidth: 2,
          pointRadius: type === "line" ? 0 : 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5e7eb", boxWidth: 10 } }
      },
      scales: {
        x: { ticks: { color: "#9ca3af" } },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(156,163,175,0.2)" }
        }
      }
    }
  });
}

// DOWNLOAD CSV
btnDownload.addEventListener("click", () => {
  if (!historiData.length) return;
  const { buckets } = aggregateData(historiData, currentAgg);
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

// INIT
window.addEventListener("DOMContentLoaded", () => {
  initRealtimeChart();
});
