// Initialize the map
var map = L.map('map', {
    center: [47.6205, 6.3498],
    zoom: 10,
    zoomControl: false
});

// Add cartodb tiles
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM',
    maxNativeZoom: 19,
    maxZoom: 22
}).addTo(map);

// Layer groups to hold our features
var routesLayer;
var prLayer;
var previousSelections = [];

// Function to style PR points
function pr70Style(feature) {
    return {
        radius: 3,
        fillColor: "#ff0000",
        color: "none",
        fillOpacity: 1
    };
}

// Function to handle road click event
function onRoadClick(e, roadFeature, roadLayer) {
    // Clear previous selections
    previousSelections.forEach(selection => {
        selection.layer.setStyle(selection.originalStyle);
        if (selection.label) map.removeLayer(selection.label);
        if (selection.polyline) map.removeLayer(selection.polyline);
    });
    previousSelections = [];

    // Create a point where the road was clicked
    var clickLatLng = e.latlng;
    var clickPoint = L.circleMarker(clickLatLng, {
        radius: 5,
        fillColor: "#0000ff",
        color: "none",
        fillOpacity: 1
    }).addTo(map);

    // Find PR points on the same road
    var roadId = roadFeature.properties.nom_route;
    var prPoints = [];
    prLayer.eachLayer(function (layer) {
        if (layer.feature.properties.route_pr === roadId) {
            prPoints.push(layer);
        }
    });

    // Convert road to Turf.js line string
    var roadCoords = roadLayer.feature.geometry.coordinates;
    var roadLine = turf.lineString(roadCoords);

    // Find distances along the road to each PR point
    var distances = prPoints.map(function (prLayer) {
        var prLatLng = prLayer.getLatLng();
        var prPoint = turf.point([prLatLng.lng, prLatLng.lat]);
        var snapped = turf.nearestPointOnLine(roadLine, prPoint);
        var distance = snapped.properties.dist;
        return {
            layer: prLayer,
            distance: distance,
            num_pr: prLayer.feature.properties.num_pr,
            snapped: snapped
        };
    });

    // Sort by distance
    distances.sort((a, b) => a.distance - b.distance);

    // Get the two closest PR points
    var closest1 = distances[0];
    var closest2 = distances[1];

    // Create a popup
    var popupContent = `<b>${roadId}</b><br>Point à ${closest1.distance.toFixed(2)} m du PR ${closest1.num_pr}.<br>Et à ${closest2.distance.toFixed(2)} m du PR ${closest2.num_pr}.`;
    clickPoint.bindPopup(popupContent).openPopup();

    // Highlight the two PR points and the section of the road
    closest1.layer.setStyle({ fillColor: "#00ff00" });
    closest2.layer.setStyle({ fillColor: "#00ff00" });
    var label1 = addLabelToPR(closest1);
    var label2 = addLabelToPR(closest2);
    var polyline = highlightRoadSection(roadLine, closest1.snapped, closest2.snapped);

    // Save the selections for resetting
    previousSelections.push({ layer: closest1.layer, originalStyle: pr70Style(closest1.layer.feature), label: label1 });
    previousSelections.push({ layer: closest2.layer, originalStyle: pr70Style(closest2.layer.feature), label: label2 });
    previousSelections.push({ polyline: polyline });
}

// Function to add labels to PR points
function addLabelToPR(pr) {
    var label = L.marker(pr.layer.getLatLng(), {
        icon: L.divIcon({
            className: 'pr-label',
            html: pr.num_pr,
            iconSize: [20, 20]
        })
    }).addTo(map);
    return label;
}

// Function to highlight the road section between two points
function highlightRoadSection(roadLine, startSnapped, endSnapped) {
    var startIndex = startSnapped.properties.index;
    var endIndex = endSnapped.properties.index;
    if (startIndex > endIndex) {
        [startIndex, endIndex] = [endIndex, startIndex];
    }
    var segmentCoords = roadLine.geometry.coordinates.slice(startIndex, endIndex + 1);
    var segment = turf.lineString(segmentCoords);

    var polyline = L.geoJson(segment, {
        style: { color: "#00ff00", weight: 3, opacity: 1 }
    }).addTo(map);

    return polyline;
}

// Fetch and add the GeoJSON data
fetch('data/routes70.geojson')
    .then(response => response.json())
    .then(data => {
        routesLayer = L.geoJson(data, {
            style: { color: "#4d4d4d", weight: 2, opacity: 0.8 },
            onEachFeature: function (feature, layer) {
                layer.on('click', function (e) {
                    onRoadClick(e, feature, layer);
                });
            }
        }).addTo(map);

        // Fetch and add the first layer (pr70.geojson) with red dot styling
        return fetch('data/pr70.geojson');
    })
    .then(response => response.json())
    .then(data => {
        prLayer = L.geoJson(data, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, pr70Style(feature));
            }
        }).addTo(map);
    });
