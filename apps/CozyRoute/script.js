/*************************************************
 * script.js
 * ---------------------------------------------
 * Fonctions :
 *  - initMap() : carte Leaflet, chargement geojson
 *  - Système "class theme-x" + "intensity-0" 
 *  - updateQuestionValue(theme, value) : 
 *       => userData[theme] = value => updateRoadStyle()
 *  - openrouteservice GEOCODE : propose des adresses 
 *       => on input >= 4 caractères
 *       => affichage suggestions
 *       => clic sur une suggestion => place un marker 
 *          (1er ou 2e) => route si 2 points
 *  - askUserLocation() : agit comme 1er ou 2e point si l'user 
 *       l'autorise
 *************************************************/

/***********************************************
 * 0) Variables globales
 ***********************************************/
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// userData : notes sliders (0 à 5)
let userData = {
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

// Carte Leaflet et couches
let map = null;
let cozyRouteLayer = null;
let routeLayer = null;     // itinéraire
let clickMarkers = [];     // 2 points max (marqueurs) => route

// Radar chart (facultatif)
let radarChart = null;

// Liste de thèmes (sliders)
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
 * 1) init
 ***********************************************/
window.addEventListener("load", () => {
  console.log("[INIT] CozyRoute start");
  initMap();
  initDirectionsPanel();
  initRadarChart();
  initUIButtons();
});

function initUIButtons() {
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
        alert("Veuillez saisir une adresse.");
        return;
      }
      console.log("[SEARCH] address:", address);
      // ex: geocodeAddress(address);
    });
  }
}
/***********************************************
 * 2) initMap : carte + chargement geojson
 ***********************************************/
function initMap() {
  map = L.map("map").setView([49.0389, 2.0760], 13);
  console.log("[MAP] carte créée");

  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur geojson");
      return resp.json();
    })
    .then(data => {
      console.log(`[GEOJSON] Features: ${data.features.length}`);
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const c = feature.properties.class || "";
          const finalClass = (c + " intensity-0").trim();
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);

      map.fitBounds(cozyRouteLayer.getBounds());
      console.log("[MAP] Vue ajustée sur layer");
    })
    .catch(err => {
      console.error("[GEOJSON] erreur:", err);
    });

  // Clic sur la carte => 1er / 2e point
  map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * 3) handleMapClick : 
 *    On pose un marqueur (1er ou 2e).
 *    S'il y en a déjà 2, on clear + recommence.
 *    Si on obtient 2 points => getRoute
 ***********************************************/
function handleMapClick(latlng) {
  // si 2 => clear
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }
  // Ajout marker
  const mk = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(mk);

  // si 2 => route
  if (clickMarkers.length === 2) {
    const A = clickMarkers[0].getLatLng();
    const B = clickMarkers[1].getLatLng();
    getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

// efface marqueurs et itinéraire
function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach(m => map.removeLayer(m));
  clickMarkers = [];
}

/***********************************************
 * 4) getRoute : ORS directions
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  console.log(`[ROUTE] from ${lat1},${lng1} to ${lat2},${lng2}`);
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  const routeUrl = "https://api.openrouteservice.org/v2/directions/foot-walking";
  const bodyData = {
    coordinates: [
      [lng1, lat1],
      [lng2, lat2]
    ]
  };

  fetch(routeUrl, {
    method:"POST",
    headers:{
      "accept": "*/*",
      "authorization": ORS_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyData)
  })
  .then(r => {
    if (!r.ok) throw new Error("ORS route error");
    return r.json();
  })
  .then(data => {
    if (!data || !data.routes || data.routes.length===0) {
      throw new Error("Itinéraire introuvable");
    }
    const route = data.routes[0];
    console.log(`[ROUTE] distance = ${route.summary.distance} m`);

    const coordsDecoded = decodePolyline(route.geometry);
    const routeGeo = {
      type:"Feature",
      geometry: {
        type:"LineString",
        coordinates: coordsDecoded.map(([la, ln]) => [ln, la])
      },
      properties:{}
    };

    routeLayer = L.geoJSON(routeGeo, {
      style:{color:"#1976D2", weight:4}
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), {padding:[20,20]});
    showDirectionsPanel(route);
  })
  .catch(err => {
    console.error("[ROUTE] error:", err);
  });
}

// decode polyline ORS
function decodePolyline(encoded) {
  let currentPosition=0, currentLat=0, currentLng=0;
  const coords=[];

  while(currentPosition<encoded.length) {
    let shift=0, result=0, byte=null;
    // lat
    do {
      byte=encoded.charCodeAt(currentPosition++)-63;
      result |= (byte & 0x1F) << shift;
      shift +=5;
    }while(byte>=0x20);
    const deltaLat = (result & 1)? ~(result>>1) : (result>>1);
    currentLat += deltaLat;

    // lng
    shift=0; result=0;
    do {
      byte=encoded.charCodeAt(currentPosition++)-63;
      result |= (byte & 0x1F)<< shift;
      shift +=5;
    }while(byte>=0x20);
    const deltaLng = (result &1)? ~(result>>1) : (result>>1);
    currentLng += deltaLng;

    coords.push([currentLat/1e5, currentLng/1e5]);
  }
  return coords;
}

/***********************************************
 * showDirectionsPanel
 ***********************************************/
function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");
  const dist = (route.summary.distance/1000).toFixed(2);
  const dur  = (route.summary.duration/60).toFixed(0);
  document.getElementById("directions-summary").textContent =
    `Distance : ${dist} km | Durée : ~${dur} min`;

  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML="";
  if (route.segments && route.segments.length>0) {
    route.segments.forEach(seg => {
      seg.steps.forEach(step => {
        const li=document.createElement("li");
        const stDist=(step.distance||0).toFixed(0);
        const instr= step.instruction||"";
        const name = step.name && step.name!=="-" ? `(${step.name})`:"";
        li.textContent=`${stDist} m - ${instr} ${name}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", ()=> {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

/***********************************************
 * 5) Radar Chart (optionnel)
 ***********************************************/
function initRadarChart() {
  const ctx=document.getElementById("radarChart");
  if (!ctx) return;
  radarChart=new Chart(ctx, {
    type:"radar",
    data:{
      labels: themes.map(t=> t.charAt(0).toUpperCase()+t.slice(1)),
      datasets:[{
        label:"Niveau de gêne",
        data: themes.map(t=> userData[t]),
        backgroundColor: "rgba(103,58,183,0.2)",
        borderColor: "rgba(103,58,183,1)",
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      scales:{
        r:{
          min:0,
          max:5
        }
      }
    }
  });
  console.log("[RADAR] init OK");
}

function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t=> userData[t]);
  radarChart.update();
}

/***********************************************
 * 6) updateQuestionValue => sliders
 ***********************************************/
function updateQuestionValue(theme, value) {
  console.log(`[SLIDER] ${theme} => ${value}`);
  userData[theme]= parseInt(value,10);
  // Màj affichage
  document.getElementById(theme+"-value").textContent=value;
  // Radar
  updateRadarChart();
  // Màj intensité
  updateRoadStyle();
}

/***********************************************
 * 7) updateRoadStyle => intensité
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;
  console.log("[STYLE] Mise à jour intensités…");

  // Parcourt tous les thèmes
  for(const theme of themes) {
    const userVal=userData[theme];
    console.log(`  => Thème=${theme}, userVal=${userVal}`);

    cozyRouteLayer.eachLayer(layer => {
      const oldClass=layer.options.className||"";
      // Vérifie si oldClass contient "marchabilite-", "handicap-", etc.
      if (oldClass.includes(theme+"-")) {
        console.log(`     Tronçon avant: "${oldClass}"`);
        // Replace intensity-\d+ => intensity-userVal
        const newClass = oldClass.replace(/intensity-\d+/, `intensity-${userVal}`);

        // setStyle pour la couleur + épaisseur
        layer.setStyle({
          color:"#FFFFFF",
          weight:3
        });

        // Force la classe HTML du <path>
        if (layer._path) {
          layer._path.setAttribute("class", newClass + " leaflet-interactive");
        }

        // Màj dans layer.options
        layer.options.className=newClass;
        console.log(`     Tronçon après: "${newClass}"`);
      }
    });
  }
}

/***********************************************
 * 8) UI / Rechercher une adresse => Autocomplete
 *    => sur input >=4 chars => fetch suggestions
 *    => on clique => on handleMapClick coords
 ***********************************************/

// 8.1) Sur input : "keyup" ou "input"
function onAddressInput(value) {
  if (value.length<4) {
    // vider suggestions
    displaySuggestions([]);
    return;
  }
  geocodeORS(value)
    .then(suggestions => {
      displaySuggestions(suggestions);
    })
    .catch(err => {
      console.error("[AUTOCOMPLETE] erreur:", err);
      displaySuggestions([]);
    });
}

// 8.2) geocodeORS : autocomplétion
function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;

  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Erreur ORS geocode");
      return r.json();
    })
    .then(data => {
      if (!data || !data.features) return [];
      // On récupère titre + coords
      return data.features.map(f => ({
        label: f.properties.label,
        coord: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
        // lat, lng
      }));
    });
}

// 8.3) displaySuggestions : 
function displaySuggestions(list) {
  const container = document.getElementById("autocomplete-results");
  if (!container) return;  // si pas de <div id="autocomplete-results">
  container.innerHTML = "";
  list.forEach(item => {
    const li=document.createElement("li");
    li.textContent=item.label;
    li.style.cursor="pointer";
    li.addEventListener("click", ()=>{
      // user a cliqué => place un marker => handleMapClick
      container.innerHTML=""; // clear suggestions
      handleMapClick({lat:item.coord[0], lng:item.coord[1]});
    });
    container.appendChild(li);
  });
}

/***********************************************
 * 9) askUserLocation : si on veut un bouton "Me localiser"
 *    => 1er ou 2e point
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("Pas support géoloc");
    return;
  }
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude;
    // Place comme 1er ou 2e marker
    handleMapClick({lat, lng});
  }, err=>{
    console.warn("[GEOLOC] erreur:", err);
  }, {enableHighAccuracy:true});
}
