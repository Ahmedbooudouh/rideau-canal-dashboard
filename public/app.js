// app.js - Frontend logic for Rideau Canal Dashboard

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds
const API_BASE = ""; // same origin: http://localhost:3002

let charts = {
  dows: null,
  fifth: null,
  nac: null
};

document.addEventListener("DOMContentLoaded", () => {
  fetchAndRenderLatest();
  fetchAndRenderHistory();

  setInterval(() => {
    fetchAndRenderLatest();
    fetchAndRenderHistory();
  }, REFRESH_INTERVAL_MS);
});

async function fetchAndRenderLatest() {
  const lastUpdatedEl = document.getElementById("last-updated");
  const cardsContainer = document.getElementById("cards-container");

  try {
    const res = await fetch(`${API_BASE}/api/latest`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    cardsContainer.innerHTML = "";
    if (!Array.isArray(data) || data.length === 0) {
      cardsContainer.innerHTML =
        '<p class="section-subtitle">No data available yet.</p>';
      return;
    }

    // --- Enforce order: Dows Lake -> Fifth Avenue -> NAC ---
    const preferredOrder = ["Dows Lake", "Fifth Avenue", "NAC"];
    const sorted = [...data].sort((a, b) => {
      const locA = a.location || "";
      const locB = b.location || "";
      const idxA = preferredOrder.indexOf(locA);
      const idxB = preferredOrder.indexOf(locB);

      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;

      if (orderA !== orderB) return orderA - orderB;
      return locA.localeCompare(locB);
    });
    // ------------------------------------------------------

    sorted.forEach((doc) => {
      const card = buildStatusCard(doc);
      cardsContainer.appendChild(card);
    });

    const now = new Date();
    lastUpdatedEl.textContent =
      "Last update: " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    console.error("Failed to load latest data:", err);
    cardsContainer.innerHTML =
      '<p class="section-subtitle">Error loading data from API.</p>';
  }
}

function buildStatusCard(doc) {
  const location = doc.location || "Unknown";
  const windowEnd = doc.windowEnd || "";
  const safetyStatus = (doc.safetyStatus || "Unknown").toLowerCase();

  const avgIce = numOrDash(doc.avgIceThickness);
  const avgSurface = numOrDash(doc.avgSurfaceTemperature);
  const maxSnow = numOrDash(doc.maxSnowAccumulation);
  const readingCount = doc.readingCount ?? "—";

  const card = document.createElement("article");
  card.className = "status-card";

  // Safety badge style
  let badgeClass = "status-warning";
  let label = doc.safetyStatus || "Unknown";

  if (safetyStatus === "safe") {
    badgeClass = "status-safe";
  } else if (safetyStatus === "warning" || safetyStatus === "caution") {
    badgeClass = "status-warning";
  } else if (safetyStatus === "unsafe" || safetyStatus === "closed") {
    badgeClass = "status-danger";
  }

  const prettyTime = windowEnd
    ? new Date(windowEnd).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";

  card.innerHTML = `
    <div class="status-header">
      <div>
        <div class="status-location">${location}</div>
        <div class="status-time">Window end: ${prettyTime}</div>
      </div>
      <div class="status-badge ${badgeClass}">
        <span class="status-dot"></span>
        <span>${label}</span>
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-chip">
        <span class="metric-label">Avg ice thickness</span>
        <span class="metric-value">${avgIce} cm</span>
      </div>
      <div class="metric-chip">
        <span class="metric-label">Avg surface temp</span>
        <span class="metric-value">${avgSurface} °C</span>
      </div>
      <div class="metric-chip">
        <span class="metric-label">Max snow</span>
        <span class="metric-value">${maxSnow} cm</span>
      </div>
      <div class="metric-chip">
        <span class="metric-label">Readings</span>
        <span class="metric-value">${readingCount}</span>
      </div>
    </div>
  `;

  return card;
}

function numOrDash(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

// ---------------- History + Chart.js ----------------

async function fetchAndRenderHistory() {
  await Promise.all([
    // IMPORTANT: use exact string in Cosmos: "Dows Lake"
    renderHistoryForLocation("Dows Lake", "chart-dows"),
    renderHistoryForLocation("Fifth Avenue", "chart-fifth"),
    renderHistoryForLocation("NAC", "chart-nac")
  ]);
}

async function renderHistoryForLocation(location, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  try {
    const params = new URLSearchParams({
      location,
      hours: "24"
    });

    const res = await fetch(`${API_BASE}/api/history?` + params.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const labels = data.map((doc) =>
      new Date(doc.windowEnd).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    );

    const iceValues = data.map((doc) => Number(doc.avgIceThickness || 0));
    const tempValues = data.map((doc) => Number(doc.avgSurfaceTemperature || 0));

    const ctx = canvas.getContext("2d");

    // Destroy previous chart if exists
    if (charts[canvasIdToKey(canvasId)]) {
      charts[canvasIdToKey(canvasId)].destroy();
    }

    charts[canvasIdToKey(canvasId)] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Avg ice thickness (cm)",
            data: iceValues,
            yAxisID: "y-ice",
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: "Avg surface temp (°C)",
            data: tempValues,
            yAxisID: "y-temp",
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.parsed.y;
                if (ctx.datasetIndex === 0) {
                  return `Ice: ${v.toFixed(1)} cm`;
                }
                return `Temp: ${v.toFixed(1)} °C`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6
            }
          },
          "y-ice": {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: "Ice (cm)"
            }
          },
          "y-temp": {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: "Temp (°C)"
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  } catch (err) {
    console.error(`Failed to load history for ${location}:`, err);
  }
}

function canvasIdToKey(id) {
  if (id === "chart-dows") return "dows";
  if (id === "chart-fifth") return "fifth";
  if (id === "chart-nac") return "nac";
  return id;
}
