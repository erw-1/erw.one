// js/config.js
// Configuration globale et variables partagées pour CozyRoute

export const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// Notes de sensibilité de l'utilisateur (0 à 5). Une note de 5 indique une intolérance élevée.
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

// Liste des thèmes correspondant à chaque facteur.
export const themes = [
  "odorat", "marchabilite", "claustrophobie", "agoraphobie", "pollution",
  "bruit", "eclairage", "handicap", "trafic_routier"
];

// Tableau pour stocker les suggestions de géocodage.
export let lastSuggestions = [];
