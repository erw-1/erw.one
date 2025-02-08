/**
 * globals.js
 * Variables globales partagées entre les modules de l'application CozyRoute.
 */
export const Globals = {
  // Clé API pour OpenRouteService
  ORS_API_KEY: "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d",
  
  // Préférences utilisateur initialisées à 0 pour chaque thème
  userData: {
    odorat: 0,
    marchabilite: 0,
    claustrophobie: 0,
    agoraphobie: 0,
    pollution: 0,
    bruit: 0,
    eclairage: 0,
    handicap: 0,
    trafic_routier: 0
  },
  
  // Liste des thèmes utilisés
  themes: [
    "odorat", "marchabilite", "claustrophobie", "agoraphobie",
    "pollution", "bruit", "eclairage", "handicap", "trafic_routier"
  ],
  
  // Suggestions d'adresses récupérées lors de la recherche
  lastSuggestions: [],
  
  // Références liées à la carte et aux itinéraires
  map: null,
  cozyRouteLayer: null,
  routeLayer: null,
  clickMarkers: [],
  cozyRouteData: null,
  
  // Variables pour le mode GPS
  gpsModeActive: false,
  gpsWatchId: null,
  gpsMarker: null,
  
  // Référence au graphique radar
  radarChart: null
};
