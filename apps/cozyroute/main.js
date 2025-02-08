/**
 * main.js
 * Module principal qui initialise l'application CozyRoute.
 */
import { initMap } from "./map.js";
import { initUIButtons, initSearchInputEvents, toggleGpsMode } from "./ui.js";
import { initDirectionsPanel } from "./routing.js";
import { initRadarChart } from "./chart.js";

window.addEventListener("load", () => {
  // Initialisation de la carte Leaflet.
  initMap();
  // Initialisation du panneau d'itinéraire.
  initDirectionsPanel();
  // Initialisation du graphique radar.
  initRadarChart();
  // Initialisation des événements de l'interface utilisateur.
  initUIButtons();
  initSearchInputEvents();

  // Activation du bouton Mode GPS.
  const modeGpsBtn = document.getElementById("mode-gps");
  if (modeGpsBtn) {
    modeGpsBtn.addEventListener("click", toggleGpsMode);
  }
});
