// js/config.js
// Configuration and shared global variables for CozyRoute

export const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// User's sensitivity ratings for various factors (0 to 5)
// A value of 5 indicates a high intolerance.
export let userData = {
  odorat: 0,
  marchabilite: 0,
  claustrophobie: 0,
  agoraphobie: 0,
  pollution: 0,
  bruit: 0,
  eclairage: 0,
  handicap: 0,
  trafic_routier: 0
};

// List of themes corresponding to each factor.
export const themes = [
  "odorat", "marchabilite", "claustrophobie", "agoraphobie", "pollution",
  "bruit", "eclairage", "handicap", "trafic_routier"
];

// Suggestions returned by the geocoding API.
export let lastSuggestions = [];
