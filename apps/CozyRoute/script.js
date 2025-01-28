/*************************************************
 * script.js — version "logs + code simplifié"
 * ---------------------------------------------
 *  - Charge un geojson : feature.properties.class = "handicap-4", etc.
 *  - Applique "handicap-4 intensity-0" comme classes initiales
 *  - Quand on bouge un slider (ex: "handicap"), on remplace
 *    "intensity-X" par "intensity-<valeurSlider>"
 *    pour toutes les lignes qui contiennent "handicap-".
 * 
 *  - Ajout de console.log pour suivre ce qui se passe
 *************************************************/

/***********************************************
 * 0) Variables globales / config
 ***********************************************/
let map = null;              // Carte Leaflet
let cozyRouteLayer = null;   // Couche GEOJSON
const userData = {
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

const themes = [
  "odorat",
  "marchabilite",
  "claustrophobie",
  "agoraphobie",
  "pollution",
  "bruit",
  "eclairage",
  "handicap",
  "trafic_routier"
];

/***********************************************
 * 1) Initialisation globale
 ***********************************************/
window.addEventListener("load", () => {
  console.log("[INIT] Page chargée, on lance initMap");
  initMap();
});

/***********************************************
 * 2) initMap: Créer la carte et charger le GeoJSON
 ***********************************************/
function initMap() {
  // Création de la carte centrée sur Cergy (ex.)
  map = L.map("map").setView([49.0389, 2.0760], 13);
  
  console.log("[MAP] Carte créée");

  // Charger le geojson
  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur réseau (cozyroute.geojson)");
      console.log("[GEOJSON] Fichier chargé OK");
      return resp.json();
    })
    .then(data => {
      console.log(`[GEOJSON] Nombre de features = ${data.features.length}`);

      // Création de la couche
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const geojsonClass = feature.properties.class || "";
          // On ajoute " intensity-0"
          const finalClass = `${geojsonClass} intensity-0`.trim();
          console.log(`[GEOJSON] Tronçon class="${finalClass}"`);
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);

      // Ajuste la vue
      map.fitBounds(cozyRouteLayer.getBounds());
      console.log("[MAP] Vue ajustée sur cozyRouteLayer");
    })
    .catch(err => {
      console.error("Erreur chargement geojson:", err);
    });
}

/***********************************************
 * 3) updateQuestionValue : le slider bouge => actualiser userData + logs
 ***********************************************/
function updateQuestionValue(theme, value) {
  console.log(`[SLIDER] Le slider "${theme}" passe à ${value}`);
  userData[theme] = parseInt(value, 10);

  // Met à jour le <span>…/5
  document.getElementById(theme + "-value").textContent = value;

  // On relance la mise à jour de style
  updateRoadStyle();
}

/***********************************************
 * 4) updateRoadStyle: Parcours tous les tronçons
 *    => Si un tronçon a "odorat-" et userVal=4 => "intensity-4"
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) {
    console.warn("[INTENSITY] cozyRouteLayer pas encore prêt");
    return;
  }
  console.log("[INTENSITY] Mise à jour des intensités…");

  // Pour chaque thème
  themes.forEach(theme => {
    const userVal = userData[theme];
    console.log(`- Thème=${theme} / userVal=${userVal}`);

    // On balaie chaque layer
    cozyRouteLayer.eachLayer(layer => {
      const cName = layer.options.className || "";
      // Check si cName contient ex: "handicap-", "odorat-"
      if (cName.includes(theme + "-")) {
        console.log(`  => Tronçon avant: "${cName}"`);
        // Remplace intensity-\d par intensity-userVal
        // ex: "handicap-4 intensity-0" => "handicap-4 intensity-3"
        const newClass = cName.replace(/intensity-\d+/, `intensity-${userVal}`);
        console.log(`  => Tronçon après: "${newClass}"`);

        layer.setStyle({
          color: "#FFFFFF",
          weight: 3,
          className: newClass.trim()
        });
      }
    });
  });
  console.log("[INTENSITY] Fin de updateRoadStyle");
}
