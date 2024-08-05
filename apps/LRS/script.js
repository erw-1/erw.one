// Constants
const simplificationThreshold = 0.01, magnetismRange = 600, zoomRequirement = 12;

// Map Initialization
let map = L.map('map', { center: [47.6205, 6.3498], zoom: 10, zoomControl: false });
L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    attribution: 'HSN | OSM', maxNativeZoom: 19, maxZoom: 22
}).addTo(map);

// Create Panes
map.createPane('routesPane').style.zIndex = 400;
map.createPane('pointsPane').style.zIndex = 500;
map.createPane('previewPane').style.zIndex = 600;

// Layer Groups
let routesLayer, pointsLayer, previewPoint, highlightedLayer, highlightedTooltip, originalData;
let closestPrLayer = L.layerGroup().addTo(map), clickedPointsLayer = L.layerGroup().addTo(map);
let closestPrTooltips = [];

// Styles
const styles = {
    route: { color: "#4d4d4d", weight: 2, opacity: 0.8, pane: 'routesPane' },
    highlight: { color: "#2d2d2d", weight: 3, opacity: 1, pane: 'routesPane' },
    point: (fillColor) => ({ radius: 3, fillColor, color: "none", fillOpacity: 1, pane: 'pointsPane' }),
    preview: { radius: 3, fillColor: "#ffff00", color: "none", fillOpacity: 1, pane: 'previewPane' }
};

// Utility Functions
const simplifyGeometry = (data, zoom) => {
    const tolerance = zoom < zoomRequirement ? simplificationThreshold : 0;
    return turf.simplify(data, { tolerance, highQuality: true });
};

const getNearestPoint = (latlng) => {
    const point = turf.point([latlng.lng, latlng.lat]);
    let nearestPoint = null, minDistance = magnetismRange, nearestLayer = null;
    routesLayer.eachLayer(layer => {
        const line = turf.feature(layer.feature.geometry);
        const snapped = turf.nearestPointOnLine(line, point);
        const distance = turf.distance(point, snapped, { units: 'meters' });
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = snapped;
            nearestLayer = layer;
        }
    });
    return { nearestPoint, nearestLayer };
};

const findClosestPRs = (previewPoint, routeId) => {
    const point = turf.point([previewPoint[0], previewPoint[1]]);
    const prPoints = [];
    pointsLayer.eachLayer(layer => {
        if (layer.feature.properties.route_pr === routeId) {
            const prPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
            prPoints.push({ layer, distance: turf.distance(point, prPoint, { units: 'meters' }), properties: layer.feature.properties });
        }
    });
    prPoints.sort((a, b) => a.distance - b.distance);

    let closestAhead = null, closestBehind = null;
    prPoints.forEach(pr => {
        const prLatLng = pr.layer.getLatLng();
        if (prLatLng.lng > previewPoint[0] && !closestAhead) closestAhead = pr;
        else if (prLatLng.lng < previewPoint[0] && !closestBehind) closestBehind = pr;
    });
    return [closestAhead, closestBehind].filter(Boolean);
};

const calculateDistanceAlongRoad = (startPoint, endPoint, multiLine) => {
    const start = turf.point([startPoint.lng, startPoint.lat]);
    const end = turf.point([endPoint.lng, endPoint.lat]);

    let totalDistance = 0;
    if (multiLine.type === 'LineString') {
        const slicedLine = turf.lineSlice(start, end, multiLine);
        totalDistance = turf.length(slicedLine, { units: 'meters' });
    } else if (multiLine.type === 'MultiLineString') {
        multiLine.coordinates.forEach(line => {
            const lineString = turf.lineString(line);
            const slicedLine = turf.lineSlice(start, end, lineString);
            totalDistance += turf.length(slicedLine, { units: 'meters' });
        });
    }
    return totalDistance;
};

const throttle = (func, limit) => {
    let lastFunc, lastRan;
    return function() {
        const context = this, args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
};

// Event Handlers
const handleMouseMove = throttle((e) => {
    if (map.getZoom() < zoomRequirement) return;

    // Remove existing tooltips
    if (highlightedTooltip) map.removeLayer(highlightedTooltip);
    closestPrTooltips.forEach(tooltip => map.removeLayer(tooltip));
    closestPrTooltips = [];

    const { nearestPoint, nearestLayer } = getNearestPoint(e.latlng);
    if (!nearestPoint) {
        if (highlightedLayer) routesLayer.resetStyle(highlightedLayer);
        if (previewPoint) map.removeLayer(previewPoint);
        closestPrLayer.clearLayers();
        highlightedLayer = previewPoint = null;
        map.getContainer().style.cursor = '';
        return;
    }

    if (highlightedLayer && highlightedLayer !== nearestLayer) routesLayer.resetStyle(highlightedLayer);
    if (highlightedLayer !== nearestLayer) closestPrLayer.clearLayers();

    nearestLayer.setStyle(styles.highlight);
    highlightedLayer = nearestLayer;
    map.getContainer().style.cursor = 'pointer';

    const roadName = nearestLayer.feature.properties.nom_route;
    highlightedTooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'highlighted-tooltip' })
        .setContent(String(roadName))
        .setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]])
        .addTo(map);

    const closestPRs = findClosestPRs(nearestPoint.geometry.coordinates, roadName);
    const multiLine = nearestLayer.feature.geometry;

    closestPRs.forEach(pr => {
        const prLatLng = pr.layer.getLatLng();
        const previewLatLng = previewPoint ? previewPoint.getLatLng() : { lng: nearestPoint.geometry.coordinates[0], lat: nearestPoint.geometry.coordinates[1] };
        const distance = calculateDistanceAlongRoad(previewLatLng, prLatLng, multiLine);
        const tooltipContent = `<b>PR${pr.properties.num_pr}</b><br>${distance.toFixed(1)} m`;
        const prMarker = L.circleMarker(prLatLng, styles.point("#ffa500")).addTo(closestPrLayer);
        const prTooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'pr-tooltip' })
            .setContent(tooltipContent)
            .setLatLng(prLatLng)
            .addTo(map);
        closestPrTooltips.push(prTooltip);
    });

    if (previewPoint) previewPoint.setLatLng([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]]);
    else previewPoint = L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], styles.preview).addTo(map);
}, 100);

const handleMapClick = (e) => {
    if (map.getZoom() < zoomRequirement) return;
    const { nearestPoint } = getNearestPoint(e.latlng);
    if (nearestPoint) {
        L.circleMarker([nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]], styles.point("#00ff00")).addTo(clickedPointsLayer);
        if (previewPoint) map.removeLayer(previewPoint);
    }
};

const handleZoomEnd = () => {
    const currentZoom = map.getZoom();
    let data = currentZoom >= zoomRequirement ? originalData : simplifyGeometry(originalData, currentZoom);
    if (currentZoom < zoomRequirement) {
        map.removeLayer(pointsLayer);
        map.removeLayer(clickedPointsLayer);
        map.removeLayer(closestPrLayer);
    } else {
        pointsLayer.addTo(map);
        clickedPointsLayer.addTo(map);
        closestPrLayer.addTo(map);
    }
    map.removeLayer(routesLayer);
    routesLayer = L.geoJson(data, { style: styles.route }).addTo(map);
};

// Fetch Data and Initialize Layers
fetch('data/routes70.geojson')
    .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
    .then(data => {
        originalData = data;
        routesLayer = L.geoJson(simplifyGeometry(data, map.getZoom()), { style: styles.route }).addTo(map);
        return fetch('data/pr70.geojson');
    })
    .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
    .then(data => {
        pointsLayer = L.geoJson(data, { pointToLayer: (feature, latlng) => L.circleMarker(latlng, styles.point("#ff0000")) }).addTo(map);
        map.on('mousemove', handleMouseMove);
        map.on('click', handleMapClick);
        map.on('zoomend', handleZoomEnd);
    })
    .catch(error => console.error('Error fetching geojson:', error));
