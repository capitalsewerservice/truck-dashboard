// --- Configuration ---
// Replace with your actual Google Apps Script Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbziMAnufvZPvGoNgLlUpsRXGuVJ7Pxf-mLbckKHRfMw8dTlaNbcqG0eJLvS_4RdKzCyaQ/exec";

let allData = []; // Stores all raw data fetched from the API
let vaChartInstance = null; // To store Chart.js instances for updates
let peakChartInstance = null;
let kvahChartInstance = null;
let weeklyChartInstance = null;
let gaugeChartInstance = null;

// --- Data Fetching ---
async function fetchData() {
  try {
    const response = await fetch(API_URL);
    // EXPECTING A DIRECT ARRAY AS RESPONSE, NOT AN OBJECT WITH A 'data' KEY
    const rawDataArray = await response.json(); 

    // Basic validation to ensure it's an array
    if (!Array.isArray(rawDataArray)) {
      throw new Error("API did not return an array of data. Check your Google Apps Script output format.");
    }

    // Process raw data: parse timestamps, convert numbers
    const processedData = rawDataArray.map(row => { 
      // Use moment.js to parse ISO 8601 timestamp (e.g., "2025-07-04T19:10:36.000Z")
      const timestamp = moment(row.Timestamp).toDate(); 
      return {
        ...row,
        Timestamp: timestamp,
        // Convert string numbers to actual numbers, handle potential undefined/null
        L1_I_A: parseFloat(row.L1_I_A) || 0,
        L1_VA: parseFloat(row.L1_VA) || 0,
        L2_I_A: parseFloat(row.L2_I_A) || 0,
        L2_VA: parseFloat(row.L2_VA) || 0,
        // Corrected column names to match your JSON output (lowercase 'l')
        L1_Peak_I_A: parseFloat(row.l1_peak_i_a) || 0, 
        L2_Peak_I_A: parseFloat(row.l2_peak_i_a) || 0, 
        Total_VA: parseFloat(row.Total_VA) || 0,
        Total_kVAh: parseFloat(row.Total_kVAh) || 0,
        Daily_kVAh: parseFloat(row.Daily_kVAh) || 0,
      };
    });
    allData = processedData;
    console.log("Data fetched and processed:", allData); // For debugging
    return processedData;

  } catch (error) {
    console.error("Error fetching data:", error);
    alert("Failed to fetch data: " + error.message + ". Check console for more details.");
    return [];
  }
}

// --- Data Processing for Charts ---
function processDailyData(data) {
  let cumulativeL1VA = 0;
  let cumulativeL2VA = 0;

  const progressiveData = data.map(d => {
    cumulativeL1VA += d.L1_VA;
    cumulativeL2VA += d.L2_VA;
    return {
      timestamp: d.Timestamp,
      L1_VA_Cumulative: cumulativeL1VA,
      L2_VA_Cumulative: cumulativeL2VA,
      Daily_kVAh: d.Daily_kVAh, // For daily kVAh chart
      // Add other data points needed for the time-series daily charts
    };
  });

  // Calculate daily peak VA for the peak chart (max for the entire day)
  const L1_VA_Peak = Math.max(...data.map(d => d.L1_Peak_I_A)); // Uses the corrected processed field name
  const L2_VA_Peak = Math.max(...data.map(d => d.L2_Peak_I_A)); // Uses the corrected processed field name

  return { progressiveData, L1_VA_Peak, L2_VA_Peak };
}

function processWeeklyData(data) {
  const weeklyAggregates = {};

  data.forEach(d => {
    const dayKey = moment(d.Timestamp).format('YYYY-MM-DD');
    if (!weeklyAggregates[dayKey]) {
      weeklyAggregates[dayKey] = {
        date: dayKey,
        maxDailyKVAh: 0,
        peakL1VA: 0,
        peakL2VA: 0,
      };
    }
    weeklyAggregates[dayKey].maxDailyKVAh = Math.max(weeklyAggregates[dayKey].maxDailyKVAh, d.Daily_kVAh);
    weeklyAggregates[dayKey].peakL1VA = Math.max(weeklyAggregates[dayKey].peakL1VA, d.L1_VA);
    weeklyAggregates[dayKey].peakL2VA = Math.max(weeklyAggregates[dayKey].peakL2VA, d.L2_VA);
  });

  return Object.values(weeklyAggregates).sort((a, b) => moment(a.date).valueOf() - moment(b.date).valueOf());
}


// --- Chart Drawing Functions (Updated to destroy old instances) ---
function drawLineChart(canvasId, labels, datasets, yAxisLabel = '') {
  const ctx = document.getElementById(canvasId).getContext('2d');
  // Destroy existing chart instance if it exists
  let chartInstance;
  if (canvasId === 'vaChart') chartInstance = vaChartInstance;
  else if (canvasId === 'kvahChart') chartInstance = kvahChartInstance;

  if (chartInstance) {
    chartInstance.destroy();
  }

  const newChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Allow canvas to resize based on parent
      scales: {
        x: {
          ticks: {
            callback: function(val, index) {
              // Ensure label is a valid date object for formatting
              return moment(this.getLabelForValue(val)).format('HH:mm'); // HH:MM
            },
            autoSkip: true,
            maxTicksLimit: 10
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: function(context) {
              return moment(context[0].label).format('MMM D,YYYY HH:mm');
            }
          }
        }
      }
    }
  });

  if (canvasId === 'vaChart') vaChartInstance = newChart;
  else if (canvasId === 'kvahChart') kvahChartInstance = newChart;
}

function drawBarChart(canvasId, labels, datasets, yAxisLabel = '') {
  const ctx = document.getElementById(canvasId).getContext('2d');
  // Destroy existing chart instance
  let chartInstance;
  if (canvasId === 'peakChart') chartInstance = peakChartInstance;
  else if (canvasId === 'weeklyChart') chartInstance = weeklyChartInstance; // Now weekly is a bar chart

  if (chartInstance) {
    chartInstance.destroy();
  }

  const newChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          // For peak chart, labels are 'L1 Peak VA', 'L2 Peak VA'
          // For weekly chart, labels are dates
          ticks: {
             callback: function(val, index) {
                const label = this.getLabelForValue(val);
                if (canvasId === 'weeklyChart') {
                    return moment(label).format('ddd, MMM D'); // Format date for weekly
                }
                return label; // Keep as is for peak chart (e.g., 'L1 Peak VA')
             },
             autoSkip: true,
             maxTicksLimit: 10
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: function(context) {
                if (canvasId === 'weeklyChart') {
                    return moment(context[0].label).format('MMMM D,YYYY');
                }
                return context[0].label;
            }
          }
        }
      }
    }
  });

  if (canvasId === 'peakChart') peakChartInstance = newChart;
  else if (canvasId === 'weeklyChart') weeklyChartInstance = newChart;
}


function drawGaugeChart(canvasId, value) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (gaugeChartInstance) {
    gaugeChartInstance.destroy();
  }

  gaugeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ["Used VA", "Remaining"], // Changed label for clarity
      datasets: [{
        data: [value, Math.max(0, 500 - value)], // Assuming max 500VA for gauge scale, adjust as needed
        backgroundColor: ["#007bff", "#e9ecef"],
        borderWidth: 0
      }]
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: "80%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false } // Disable tooltip for gauge
      }
    }
  });
}

// --- Filtering Functions ---
function filterDataByDay(dateString) {
  return allData.filter(entry => moment(entry.Timestamp).format('YYYY-MM-DD') === dateString);
}

function filterDataByWeek(weekStartDateString) {
    const startOfWeek = moment(weekStartDateString).startOf('isoWeek');
    const endOfWeek = moment(startOfWeek).endOf('isoWeek');
    return allData.filter(entry => {
        const timestampMoment = moment(entry.Timestamp);
        return timestampMoment.isSameOrAfter(startOfWeek, 'day') && timestampMoment.isSameOrBefore(endOfWeek, 'day');
    });
}

// --- Main Dashboard Initialization ---
async function initializeDashboard(filterType = 'day', filterValue = null) {
  // Fetch data only if it hasn't been fetched or is empty (first load)
  if (allData.length === 0) {
    await fetchData();
    if (allData.length === 0) {
      console.warn("No data available to display.");
      return; // Exit if no data after fetch
    }
    populateDateSelectors(); // Populate selectors after first fetch
  }

  let dataToDisplay = [];
  if (filterType === 'day' && filterValue) {
    dataToDisplay = filterDataByDay(filterValue);
  } else if (filterType === 'week' && filterValue) {
    dataToDisplay = filterDataByWeek(filterValue);
  } else {
    // Default to the latest day if no filter is provided
    const latestDate = moment(allData[allData.length - 1].Timestamp).format('YYYY-MM-DD');
    document.getElementById('dateInput').value = latestDate;
    dataToDisplay = filterDataByDay(latestDate);
    filterValue = latestDate; // Set filterValue for consistency
  }

  if (dataToDisplay.length === 0) {
    console.warn(`No data for selected ${filterType}: ${filterValue}.`);
    // Optionally clear charts or show a message on the dashboard
    if (vaChartInstance) vaChartInstance.destroy();
    if (peakChartInstance) peakChartInstance.destroy();
    if (kvahChartInstance) kvahChartInstance.destroy();
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    if (gaugeChartInstance) gaugeChartInstance.destroy();
    return;
  }

  // --- Process and Draw Daily Charts ---
  const { progressiveData, L1_VA_Peak, L2_VA_Peak } = processDailyData(dataToDisplay);

  const dailyLabels = progressiveData.map(d => d.timestamp); // Use full timestamp for labels
  const L1_VA_Cumulative = progressiveData.map(d => d.L1_VA_Cumulative);
  const L2_VA_Cumulative = progressiveData.map(d => d.L2_VA_Cumulative);
  const Daily_kVAh_Values = progressiveData.map(d => d.Daily_kVAh);

  // Graphic 1: Daily L1 and L2 VA Progressive Consumption
  drawLineChart('vaChart', dailyLabels, [
    { label: 'L1 VA Cumulative', data: L1_VA_Cumulative, borderColor: 'blue', fill: false, tension: 0.1 },
    { label: 'L2 VA Cumulative', data: L2_VA_Cumulative, borderColor: 'green', fill: false, tension: 0.1 }
  ], 'Cumulative VA');

  // Graphic 2: Daily L1 and L2 VA Peak Consumption (for the selected day)
  drawBarChart('peakChart', ['L1 Peak VA', 'L2 Peak VA'], [
    { label: 'Daily Peak VA', data: [L1_VA_Peak, L2_VA_Peak], backgroundColor: ['#007bff', '#28a745'] }
  ], 'Peak VA');

  // Graphic 3: Daily kVAh of the day so far
  drawLineChart('kvahChart', dailyLabels, [
    { label: 'Daily kVAh', data: Daily_kVAh_Values, borderColor: 'purple', fill: true, tension: 0.1 }
  ], 'kVAh');

  // Graphic 5: Live L1 VA Gauge Chart (uses the last VA reading from the displayed data)
  const lastL1VA = dataToDisplay[dataToDisplay.length - 1].L1_VA;
  drawGaugeChart('liveGaugeChart', lastL1VA);

  // --- Process and Draw Weekly Chart ---
  // The weekly chart will always show the statistics for the week containing the selected date.
  // Ensure we use the 'filterValue' (which is the selected date/week start) to define the week.
  const weekData = filterDataByWeek(filterValue || moment().format('YYYY-MM-DD'));
  const weeklySummary = processWeeklyData(weekData);

  const weeklyLabels = weeklySummary.map(d => d.date);
  const weeklyMaxKVAh = weeklySummary.map(d => d.maxDailyKVAh);
  const weeklyPeakL1VA = weeklySummary.map(d => d.peakL1VA);
  const weeklyPeakL2VA = weeklySummary.map(d => d.peakL2VA);

  // Graphic 4: Weekly Statistics
  drawBarChart('weeklyChart', weeklyLabels, [
    { label: 'Max Daily kVAh', data: weeklyMaxKVAh, backgroundColor: '#ffc107', yAxisID: 'y' },
    { label: 'L1 Peak VA', data: weeklyPeakL1VA, backgroundColor: '#dc3545', yAxisID: 'y1' },
    { label: 'L2 Peak VA', data: weeklyPeakL2VA, backgroundColor: '#17a2b8', yAxisID: 'y1' }
  ], 'Value'); // Y-axis label will be overridden by dual axes

  // Specific options for the weekly chart's dual Y-axes
  // These need to be applied after the chart instance is created.
  weeklyChartInstance.options.scales.y = {
    beginAtZero: true,
    position: 'left',
    title: { display: true, text: 'Max Daily kVAh' },
    grid: { drawOnChartArea: false } // Only draw grid for one axis
  };
  weeklyChartInstance.options.scales.y1 = {
    beginAtZero: true,
    position: 'right',
    title: { display: true, text: 'Peak VA' },
    grid: { drawOnChartArea: false }
  };
  weeklyChartInstance.update(); // Apply axis updates


  // Update current week range display
  const displayDate = moment(filterValue);
  const currentWeekStart = displayDate.startOf('isoWeek').format('MMM D,YYYY');
  const currentWeekEnd = displayDate.endOf('isoWeek').format('MMM D,YYYY');
  document.getElementById('currentWeekRange').textContent = `(Week of ${currentWeekStart} - ${currentWeekEnd})`;
}

// --- Populate Date/Week Selectors ---
function populateDateSelectors() {
    const dateInput = document.getElementById('dateInput');
    const weekSelect = document.getElementById('weekSelect');

    const uniqueDates = [...new Set(allData.map(entry => moment(entry.Timestamp).format('YYYY-MM-DD')))]
        .sort((a, b) => moment(b).valueOf() - moment(a).valueOf()); // Sort descending

    // Populate daily date selector
    dateInput.innerHTML = ''; // Clear previous options
    uniqueDates.forEach(dateStr => {
        const option = document.createElement('option');
        option.value = dateStr;
        option.textContent = moment(dateStr).format('MMMM D,YYYY');
        dateInput.appendChild(option);
    });

    // Populate weekly selector
    const uniqueWeeks = new Set();
    allData.forEach(entry => {
        const weekStart = moment(entry.Timestamp).startOf('isoWeek').format('YYYY-MM-DD');
        uniqueWeeks.add(weekStart);
    });
    const sortedWeeks = Array.from(uniqueWeeks).sort((a, b) => moment(b).valueOf() - moment(a).valueOf()); // Sort descending

    weekSelect.innerHTML = ''; // Clear previous options
    sortedWeeks.forEach(weekStart => {
        const option = document.createElement('option');
        const weekEnd = moment(weekStart).endOf('isoWeek').format('YYYY-MM-DD');
        option.value = weekStart;
        option.textContent = `Week of ${moment(weekStart).format('MMM D')} - ${moment(weekEnd).format('MMM D,YYYY')}`;
        weekSelect.appendChild(option);
    });

    // Set default selected date/week to the latest available
    if (uniqueDates.length > 0) {
        dateInput.value = uniqueDates[0];
    }
    if (sortedWeeks.length > 0) {
        weekSelect.value = sortedWeeks[0];
    }
}


// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dateInput').addEventListener('change', (event) => {
    initializeDashboard('day', event.target.value);
  });

  document.getElementById('weekSelect').addEventListener('change', (event) => {
    initializeDashboard('week', event.target.value);
  });

  // Initial load of the dashboard
  initializeDashboard();

  // Setup auto-refresh every 60 seconds (re-enabled as it was not the cause of the glitch once charts destroy correctly)
  setInterval(() => {
    // Re-fetch all data and then re-initialize with current selection
    allData = []; // Clear current data to force a fresh fetch
    const currentSelectedDate = document.getElementById('dateInput').value;
    const currentSelectedWeek = document.getElementById('weekSelect').value; // Get the currently selected week start date

    // Determine which filter is currently active
    // If a specific date is selected, prioritize it. Otherwise, use the selected week.
    // If neither, default to the latest day.
    if (document.activeElement === document.getElementById('dateInput')) {
      initializeDashboard('day', currentSelectedDate);
    } else if (document.activeElement === document.getElementById('weekSelect')) {
      initializeDashboard('week', currentSelectedWeek);
    } else if (currentSelectedDate) { // If date was selected previously
      initializeDashboard('day', currentSelectedDate);
    } else if (currentSelectedWeek) { // If week was selected previously
      initializeDashboard('week', currentSelectedWeek);
    } else {
      initializeDashboard(); // Default to latest day if nothing selected
    }
  }, 60000); // Refresh every 60 seconds (60000 ms)
});