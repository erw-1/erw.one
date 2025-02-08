// js/ui.js
// UI initialization and helper functions for search autocomplete and button events.

import { ORS_API_KEY, lastSuggestions } from "./config.js";
import { handleMapClick } from "./map.js";

/**
 * Initialize UI buttons such as the burger menu and search button.
 */
export function initUIButtons() {
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Please enter an address.");
        return;
      }
      handleEnterPress();
    });
  }
}

/**
 * Initialize search input events for live autocomplete and Enter key handling.
 */
export function initSearchInputEvents() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.addEventListener("input", (e) => {
    onAddressInput(e.target.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterPress();
    }
  });
}

/**
 * Handle the Enter key press to select the first suggestion.
 */
export function handleEnterPress() {
  if (lastSuggestions.length > 0) {
    const first = lastSuggestions[0];
    handleMapClick({ lat: first.coord[0], lng: first.coord[1] });
    displaySuggestions([]);
    document.getElementById("search-input").blur();
  }
}

/**
 * Process the user input for address autocomplete.
 *
 * @param {string} val - The current value of the search input.
 */
export function onAddressInput(val) {
  if (val.length < 4) {
    displaySuggestions([]);
    return;
  }
  geocodeORS(val)
    .then(sugs => {
      lastSuggestions.splice(0, lastSuggestions.length, ...sugs.slice(0, 3));
      displaySuggestions(lastSuggestions);
    })
    .catch(err => {
      lastSuggestions.splice(0, lastSuggestions.length);
      displaySuggestions([]);
    });
}

/**
 * Query the OpenRouteService geocoding API for address suggestions.
 *
 * @param {string} query - The address query string.
 * @returns {Promise<Array>} A promise that resolves to an array of suggestions.
 */
export function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Geocoding error");
      return r.json();
    })
    .then(data => {
      if (!data || !data.features) return [];
      return data.features.map(f => ({
        label: f.properties.label,
        coord: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
      }));
    });
}

/**
 * Display autocomplete suggestions in the UI.
 *
 * @param {Array} list - Array of suggestion objects.
 */
export function displaySuggestions(list) {
  const container = document.getElementById("autocomplete-results");
  if (!container) return;
  container.innerHTML = "";
  list.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      handleMapClick({ lat: item.coord[0], lng: item.coord[1] });
      container.innerHTML = "";
      document.getElementById("search-input").blur();
    });
    container.appendChild(li);
  });
}
