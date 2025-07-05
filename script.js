const API_URL = "https://script.google.com/macros/s/AKfycbziMAnufvZPvGoNgLlUpsRXGuVJ7Pxf-mLbckKHRfMw8dTlaNbcqG0eJLvS_4RdKzCyaQ/exec";

let allData = [];

async function fetchData() {
  const response = await fetch(API_URL);
  const data = await response.json();
  allData = data;
  return data;
}

function processData(data) {
  const timestamps = data.map(d => d.Timestamp);
  const L1_VA = data.map(d => +d.L1_VA || 0);
  const L2_VA = data.map(d => +d.L2_VA || 0);
  const L1_peak = data.map(d => +d.l1_peak_i_a || 0);
  const L2_peak = data.map(d => +d.l2_peak_i_a || 0);
  const totalKVAh = data.map(d => +d.Total_kVAh || 0);
  const dailyKVAh = data.map(d => +d.Daily_kVAh || 0);
  return { timestamps, L1_VA, L2_VA, L1_peak, L2_peak, totalKVAh, dailyKVAh };
}

function drawLineChart(ctx, labels, datasets) {
  new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function drawBarChart(ctx, labels, datasets) {
  new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function drawGaugeChart(ctx, value) {
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ["Used", "Remaining"],
      datasets: [{
        data: [value, 100 - value],
        backgroundColor: ["#007bff", "#e9ecef"],
        borderWidth: 0
      }]
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: "80%",
      plugins: { legend: { display: false } }
    }
  });
}

function filterByDate(date) {
  return allData.filter(entry => entry.Timestamp && entry.Timestamp.includes(date));
}

function drawCharts(filteredData) {
  const { timestamps, L1_VA, L2_VA, L1_peak, L2_peak, totalKVAh, dailyKVAh } = processData(filteredData);

  drawLineChart(document.getElementById('vaChart'), timestamps, [
    { label: 'L1 VA', data: L1_VA, borderColor: 'blue', fill: false },
    { label: 'L2 VA', data: L2_VA, borderColor: 'green', fill: false }
  ]);

  drawBarChart(document.getElementById('peakChart'), timestamps, [
    { label: 'L1 Peak', data: L1_peak, backgroundColor: 'blue' },
    { label: 'L2 Peak', data: L2_peak, backgroundColor: 'green' }
  ]);

  drawLineChart(document.getElementById('kvahChart'), timestamps, [
    { label: 'Total kVAh', data: totalKVAh, borderColor: 'purple', fill: true }
  ]);

  drawLineChart(document.getElementById('weeklyChart'), timestamps, [
    { label: 'Daily kVAh', data: dailyKVAh, borderColor: 'orange', fill: true }
  ]);

  drawGaugeChart(document.getElementById('liveGaugeChart'), L1_VA[L1_VA.length - 1] || 0);
}

async function initializeDashboard(dateFilter = null) {
  const rawData = await fetchData();
  const data = dateFilter ? filterByDate(dateFilter) : rawData;
  drawCharts(data);
}

// Setup auto-refresh every 60 seconds
setInterval(() => initializeDashboard(getSelectedDate()), 60000);

// Get selected date from input
function getSelectedDate() {
  return document.getElementById('dateInput').value;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dateInput').addEventListener('change', () => {
    initializeDashboard(getSelectedDate());
  });
  initializeDashboard();
});