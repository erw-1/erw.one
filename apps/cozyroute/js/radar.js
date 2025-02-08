// js/radar.js
// Initialization and update of the radar chart using Chart.js.

import { themes, userData } from "./config.js";

/**
 * Initialize the radar chart.
 * Displays the user's sensitivity ratings for each theme.
 *
 * @returns {Chart|null} The Chart.js radar chart instance.
 */
export function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return null;

  // Helper: retrieve a CSS variable value.
  function getCssVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // Helper: add an alpha value to a hex color.
  function addHexAlpha(hex, alpha = "90") {
    return /^#[0-9A-F]{6}$/i.test(hex) ? hex + alpha : hex;
  }

  const pointColors = themes.map(theme => {
    const baseColor = getCssVar(`--${theme}-color`);
    return addHexAlpha(baseColor, "FF");
  });

  // Create a conic gradient for the radar fill if supported.
  function createConicGradient(context) {
    const chart = context.chart;
    const scale = chart.scales.r || chart.scales.radialLinear;
    if (!scale || !Number.isFinite(scale.xCenter) || !Number.isFinite(scale.yCenter) ||
        typeof chart.ctx.createConicGradient !== "function") {
      return "#673AB790";
    }
    const { xCenter, yCenter } = scale;
    const gradient = chart.ctx.createConicGradient(-Math.PI / 2, xCenter, yCenter);
    const colorVars = [
      "--odorat-color", "--marchabilite-color", "--claustrophobie-color",
      "--agoraphobie-color", "--pollution-color", "--bruit-color",
      "--eclairage-color", "--handicap-color", "--trafic_routier-color"
    ];
    colorVars.forEach((varName, i) => {
      const base = getCssVar(varName);
      const withAlpha = addHexAlpha(base, "90");
      gradient.addColorStop(i / colorVars.length, withAlpha);
    });
    const firstColor = getCssVar(colorVars[0]);
    gradient.addColorStop(1, addHexAlpha(firstColor, "90"));
    return gradient;
  }

  const radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: "My Profile",
          data: themes.map(t => userData[t]),
          fill: true,
          backgroundColor: createConicGradient,
          borderColor: "#666",
          borderWidth: 1,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0,
          max: 5
        }
      }
    }
  });
  return radarChart;
}

/**
 * Update the radar chart with the latest userData.
 *
 * @param {Chart} radarChart - The Chart.js radar chart instance.
 */
export function updateRadarChart(radarChart) {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}
