// js/radar.js
// Initialisation et mise à jour du radar avec Chart.js

import { themes, userData } from "./config.js";

/**
 * Initialise le radar chart.
 * @returns {Chart|null} L'instance du radar chart Chart.js.
 */
export function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return null;

  // Fonction utilitaire pour récupérer une variable CSS.
  function getCssVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // Fonction pour ajouter une opacité à une couleur hexadécimale.
  function addHexAlpha(hex, alpha = "90") {
    return /^#[0-9A-F]{6}$/i.test(hex) ? hex + alpha : hex;
  }

  const pointColors = themes.map(theme => {
    const baseColor = getCssVar(`--${theme}-color`);
    return addHexAlpha(baseColor, "FF");
  });

  // Création d'un dégradé conique pour le remplissage du radar.
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
          label: "Mon profil",
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
 * Met à jour le radar chart avec les dernières données utilisateur.
 * @param {Chart} radarChart - L'instance du radar chart Chart.js.
 */
export function updateRadarChart(radarChart) {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}
