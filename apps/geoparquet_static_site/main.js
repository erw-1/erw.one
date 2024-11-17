// Initialize the Leaflet map
const map = L.map('map').setView([0, 0], 2);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Function to fetch and parse GeoParquet file
async function loadGeoParquet(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const parquetReader = await arrow.Table.from(arrayBuffer, { format: 'parquet' });
        
        // Assuming GeoParquet has 'geometry' column in WKB or GeoJSON format
        const geoJSONFeatures = [];

        // Example: Iterate through rows and extract geometries
        for (let i = 0; i < parquetReader.numRows; i++) {
            const geometry = parquetReader.getColumn('geometry').get(i);
            const properties = {}; // Extract other properties as needed

            // Convert WKB to GeoJSON if necessary
            // This requires a WKB parser, e.g., wellknown or Terraformer
            // For simplicity, assuming geometry is already GeoJSON
            const geoJSON = JSON.parse(geometry);

            geoJSONFeatures.push({
                type: "Feature",
                geometry: geoJSON,
                properties: properties
            });
        }

        const geoJSON = {
            type: "FeatureCollection",
            features: geoJSONFeatures
        };

        // Add GeoJSON layer to the map
        L.geoJSON(geoJSON).addTo(map);

    } catch (error) {
        console.error("Error loading GeoParquet:", error);
    }
}

// Replace with the URL to your GeoParquet file
const geoParquetURL = 'data.parquet';

// Load the GeoParquet file
loadGeoParquet(geoParquetURL);
