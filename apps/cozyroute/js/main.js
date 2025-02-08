// js/main.js
// Main entry point for the CozyRoute application.
// This file imports the various modules and initializes the application.

import { initMap } from "./map.js";
import { initUIButtons, initSearchInputEvents } from "./ui.js";
import { initRadarChart } from "./radar.js";

// The GPS mode toggle is handled in map.js, so no extra code is needed here.

window.addEventListener("load", () => {
  // Initialize the map and load GeoJSON data.
  initMap();

  // Initialize UI buttons and search input events.
  initUIButtons();
  initSearchInputEvents();

  // Initialize the radar chart.
  const radarChart = initRadarChart();

  // (Optional) You can also bind global functions such as updateQuestionValue
  // to the HTML oninput attributes (already set in your HTML).
});
