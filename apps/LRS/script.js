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

    // Find distances along the road to each PR point
    var distances = prPoints.map(function (prLayer) {
        var prLatLng = prLayer.getLatLng();
        var distance = getDistanceAlongRoad(roadLayer, clickLatLng, prLatLng);
        return {
            layer: prLayer,
            distance: distance,
            num_pr: prLayer.feature.properties.num_pr
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
    var polyline = highlightRoadSection(roadLayer, clickLatLng, [closest1.layer.getLatLng(), closest2.layer.getLatLng()]);

    // Save the selections for resetting
    previousSelections.push({ layer: closest1.layer, originalStyle: pr70Style(closest1.layer.feature), label: label1 });
    previousSelections.push({ layer: closest2.layer, originalStyle: pr70Style(closest2.layer.feature), label: label2 });
    previousSelections.push({ polyline: polyline });
}

// Function to get distance along the road between two points
function getDistanceAlongRoad(roadLayer, point1, point2) {
    var latlngs = roadLayer.getLatLngs();
    var distance = 0;
    var point1Found = false;
    var point2Found = false;

    function calculateDistance(segmentStart, segmentEnd) {
        var segmentDistance = segmentStart.distanceTo(segmentEnd);

        if (!point1Found && isPointOnSegment(point1, segmentStart, segmentEnd)) {
            distance += segmentStart.distanceTo(point1);
            point1Found = true;
        } else if (point1Found && !point2Found && isPointOnSegment(point2, segmentStart, segmentEnd)) {
            distance += point2.distanceTo(segmentEnd);
            point2Found = true;
            return true; // Stop further processing
        } else if (point1Found && !point2Found) {
            distance += segmentDistance;
        }

        return false; // Continue processing
    }

    for (var i = 0; i < latlngs.length; i++) {
        if (Array.isArray(latlngs[i])) {
            for (var j = 0; j < latlngs[i].length - 1; j++) {
                if (calculateDistance(L.latLng(latlngs[i][j]), L.latLng(latlngs[i][j + 1]))) {
                    break;
                }
            }
        } else {
            if (i < latlngs.length - 1 && calculateDistance(L.latLng(latlngs[i]), L.latLng(latlngs[i + 1]))) {
                break;
            }
        }
    }

    return distance;
}

// Function to check if a point is on a line segment
function isPointOnSegment(point, segmentStart, segmentEnd) {
    var d1 = point.distanceTo(segmentStart);
    var d2 = point.distanceTo(segmentEnd);
    var lineLength = segmentStart.distanceTo(segmentEnd);
    var buffer = 0.1; // Buffer to account for floating point imprecision
    return Math.abs((d1 + d2) - lineLength) < buffer;
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
function highlightRoadSection(roadLayer, clickLatLng, prLatLngs) {
    var latlngs = roadLayer.getLatLngs();
    var segmentLatlngs = [];
    var collecting = false;

    function collectSegment(segmentStart, segmentEnd) {
        if (isPointOnSegment(clickLatLng, segmentStart, segmentEnd) || collecting) {
            collecting = true;
            segmentLatlngs.push(segmentStart);
        }
        if (isPointOnSegment(prLatLngs[1], segmentStart, segmentEnd)) {
            segmentLatlngs.push(prLatLngs[1]);
            return true; // Stop further processing
        }
        return false; // Continue processing
    }

    for (var i = 0; i < latlngs.length; i++) {
        if (Array.isArray(latlngs[i])) {
            for (var j = 0; j < latlngs[i].length; j++) {
                if (collectSegment(L.latLng(latlngs[i][j]), L.latLng(latlngs[i][j + 1]))) {
                    break;
                }
            }
        } else {
            if (i < latlngs.length - 1 && collectSegment(L.latLng(latlngs[i]), L.latLng(latlngs[i + 1]))) {
                break;
            }
        }
    }

    var polyline = L.polyline(segmentLatlngs, {
        color: "#00ff00",
        weight: 3,
        opacity: 1
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
