/**
 * chart.js
 * Module de gestion du graphique radar pour le profil utilisateur.
 */
import { Globals } from "./globals.js";
import { updateRoadStyle } from "./map.js";

/**
 * Initialise le graphique radar avec Chart.js.
 */
export function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return;

  /**
   * Récupère la valeur d'une variable CSS.
   * @param {string} varName - Nom de la variable.
   * @returns {string} Valeur de la variable.
   */
  function getCssVar(varName) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
  }

  /**
   * Ajoute un canal alpha à une couleur hexadécimale.
   * @param {string} hex - Couleur hexadécimale.
   * @param {string} alpha - Valeur alpha.
   * @returns {string} Couleur avec alpha.
   */
  function addHexAlpha(hex, alpha = "90") {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      return hex + alpha;
    }
    return hex;
  }

  // Détermine les couleurs des points du graphique.
  const pointColors = Globals.themes.map(theme => {
    const baseColor = getCssVar(`--${theme}-color`);
    return addHexAlpha(baseColor, "FF");
  });

  /**
   * Crée un gradient conique pour l'arrière-plan du graphique.
   * @param {Object} context - Contexte du graphique.
   * @returns {string} Le gradient ou une couleur par défaut.
   */
  function createConicGradient(context) {
    const chart = context.chart;
    const scale = chart.scales.r || chart.scales.radialLinear;
    if (
      !scale ||
      !Number.isFinite(scale.xCenter) ||
      !Number.isFinite(scale.yCenter) ||
      typeof chart.ctx.createConicGradient !== "function"
    ) {
      return "#673AB790";
    }
    const { xCenter, yCenter } = scale;
    const gradient = chart.ctx.createConicGradient(-Math.PI / 2, xCenter, yCenter);
    const colorVars = [
      "--odorat-color",
      "--marchabilite-color",
      "--claustrophobie-color",
      "--agoraphobie-color",
      "--pollution-color",
      "--bruit-color",
      "--eclairage-color",
      "--handicap-color",
      "--trafic_routier-color"
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

  // Création du graphique radar.
  Globals.radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: Globals.themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: "Mon profil",
          data: Globals.themes.map(t => Globals.userData[t]),
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
}

/**
 * Met à jour le graphique radar en fonction des préférences utilisateur.
 */
export function updateRadarChart() {
  if (!Globals.radarChart) return;
  Globals.radarChart.data.datasets[0].data = Globals.themes.map(t => Globals.userData[t]);
  Globals.radarChart.update();
}

/**
 * Met à jour la valeur d'un thème, rafraîchit le graphique radar et met à jour le style de la carte.
 * @param {string} theme - Nom du thème.
 * @param {string|number} value - Valeur du slider (0 à 5).
 */
export function updateQuestionValue(theme, value) {
  Globals.userData[theme] = parseInt(value, 10);
  document.getElementById(theme + "-value").textContent = value;
  updateRadarChart();
  updateRoadStyle();
}
