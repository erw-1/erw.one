export const config = {
  // Canvas Dimensions
  width: window.innerWidth,
  height: window.innerHeight - 40, // Account for tab height

  // Tooltip Configuration
  tooltip: {
    selector: "#tooltip",
    format: (d) => `
      <b>${d.id}</b><br>
      Group: ${d.group}<br>
      ${d.value} (GWh/year)
    `,
  },

  // Force Simulation Parameters (for nodes)
  simulation: {
    chargeStrength: -300,
    linkDistance: 150,
    nodeSizeRange: [5, 30],
    linkWidthRange: [1, 10],
  },

  // Legend Configuration
  legend: {
    x: 20,
    yOffset: 350, // Distance from bottom
    rectWidth: 15,
    rectHeight: 15,
    textXOffset: 20,
    textYOffset: 12,
  },

  // Link and Node Styling
  defaultLinkColor: "#999",
  defaultNodeColor: "#ccc",
  label: {
    fontSize: "12px",
    fill: "#000",
  },
};
