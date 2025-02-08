// js/main.js
// Point d'entrée principal de l'application CozyRoute.
// Ce fichier importe et initialise les modules.

import { initMap } from "./map.js";
import { initUIButtons, initSearchInputEvents } from "./ui.js";
import { initRadarChart, updateRadarChart } from "./radar.js";
import "./routing.js"; // Charge le module de routage pour exposer la fonction getRoute globalement

window.addEventListener("load", () => {
  // Initialisation de la carte et chargement du GeoJSON.
  initMap();

  // Initialisation des composants de l'interface.
  initUIButtons();
  initSearchInputEvents();

  // Initialisation du radar chart.
  const radarChart = initRadarChart();

  // Expose les fonctions globales pour les événements inline HTML.
  window.updateQuestionValue = function(theme, value) {
    import("./config.js").then(module => {
      module.userData[theme] = parseInt(value, 10);
      document.getElementById(theme + "-value").textContent = value;
      updateRadarChart(radarChart);
      if (window.updateRoadStyle) {
        window.updateRoadStyle();
      }
    });
  };

  // Expose la fonction getRoute pour les appels inline.
  import("./routing.js").then(module => {
    window.getRoute = module.getRoute;
  });

  // Expose updateRoadStyle pour mettre à jour le style de la route.
  window.updateRoadStyle = function() {
    if (window.cozyRouteLayer) {
      window.cozyRouteLayer.eachLayer(layer => {
        const oldClass = layer.options.className || "";
        // Parcours de chaque thème pour mettre à jour l'intensité.
        import("./config.js").then(module => {
          module.themes.forEach(theme => {
            if (oldClass.includes(theme + "-")) {
              const newClass = oldClass.replace(/intensity-\d+/, `intensity-${module.userData[theme]}`);
              layer.setStyle({ color: "#FFFFFF", weight: 3 });
              if (layer._path) {
                layer._path.setAttribute("class", newClass + " leaflet-interactive");
              }
              layer.options.className = newClass;
            }
          });
        });
      });
    }
  };

  // Expose une fonction globale pour afficher le panneau des directions.
  window.showDirectionsPanel = function(route) {
    const panel = document.getElementById("directions-panel");
    panel.classList.remove("hidden");
    const dist = (route.summary.distance / 1000).toFixed(2);
    const dur = (route.summary.duration / 60).toFixed(0);
    document.getElementById("directions-summary").textContent =
      `Distance : ${dist} km | Durée : ~${dur} min`;
    const stepsUl = document.getElementById("directions-steps");
    stepsUl.innerHTML = "";
    if (route.segments && route.segments.length > 0) {
      route.segments.forEach(seg => {
        seg.steps.forEach(step => {
          const li = document.createElement("li");
          const stDist = (step.distance || 0).toFixed(0);
          const instr = step.instruction || "";
          const name = (step.name && step.name !== "-") ? `(${step.name})` : "";
          li.textContent = `${stDist} m - ${instr} ${name}`;
          stepsUl.appendChild(li);
        });
      });
    }
  };

  // Expose les données GeoJSON et la couche CozyRoute globalement.
  import("./map.js").then(module => {
    window.cozyRouteData = module.cozyRouteData;
    window.cozyRouteLayer = module.cozyRouteLayer;
  });
});
