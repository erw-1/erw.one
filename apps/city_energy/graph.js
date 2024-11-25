// Define SVG dimensions
const width = 960, height = 600;

// Tooltip for displaying information
const tooltip = d3.select("#tooltip");

// Create the SVG canvas
const svg = d3.select("svg")
  .attr("width", width)
  .attr("height", height);

// Updated data with precise fixed positions for the desired layout
const data = {
  nodes: [
    { id: "Solar Panels", group: "Sun", value: 875 },
    { id: "Thermophotovoltaics", group: "Sun", value: 100 },
    { id: "Wind Turbines", group: "Wind and Water", value: 500 },
    { id: "Marine Hydrokinetic Turbines", group: "Wind and Water", value: 75 },
    { id: "Wave Energy Converters", group: "Wind and Water", value: 50 },
    { id: "Methanisation Plants", group: "Waste", value: 1200 },
    { id: "Urban Organic Waste", group: "Waste", value: 500 },
    { id: "Sewage", group: "Waste", value: 400 },
    { id: "Agricultural Organic Waste", group: "Waste", value: 300 },
    { id: "District Heating Network", group: "Heat", value: 600 },
    { id: "Urban Heat Recovery", group: "Heat", value: 200 },
    { id: "Thermal Energy Storage", group: "Heat", value: 150 },
    { id: "Gravitational Storage", group: "Backup", value: 100 },
    { id: "Power2Gas", group: "Backup", value: 200 },
    { id: "Small Nuclear Plant (SMR)", group: "Backup", value: 50 },
    { id: "Backup and Energy Storage", group: "Storage", value: 350 },
    { id: "Electricity Grid", group: "Output", value: 1600 },
    { id: "Heat for Buildings", group: "Output", value: 600 },
  ],
  links: [
    { source: "Solar Panels", target: "Electricity Grid", value: 875 },
    { source: "Thermophotovoltaics", target: "Electricity Grid", value: 100 },
    { source: "Wind Turbines", target: "Electricity Grid", value: 500 },
    { source: "Marine Hydrokinetic Turbines", target: "Electricity Grid", value: 75 },
    { source: "Wave Energy Converters", target: "Electricity Grid", value: 50 },
    { source: "Urban Organic Waste", target: "Methanisation Plants", value: 500 },
    { source: "Sewage", target: "Methanisation Plants", value: 400 },
    { source: "Agricultural Organic Waste", target: "Methanisation Plants", value: 300 },
    { source: "Methanisation Plants", target: "District Heating Network", value: 400 },
    { source: "Methanisation Plants", target: "Electricity Grid", value: 600 },
    { source: "Methanisation Plants", target: "Backup and Energy Storage", value: 200 },
    { source: "Urban Heat Recovery", target: "District Heating Network", value: 200 },
    { source: "Thermal Energy Storage", target: "District Heating Network", value: 150 },
    { source: "Gravitational Storage", target: "Backup and Energy Storage", value: 100 },
    { source: "Power2Gas", target: "Backup and Energy Storage", value: 200 },
    { source: "Small Nuclear Plant (SMR)", target: "Backup and Energy Storage", value: 50 },
    { source: "Backup and Energy Storage", target: "Electricity Grid", value: 250 },
    { source: "Backup and Energy Storage", target: "District Heating Network", value: 100 },
    { source: "District Heating Network", target: "Heat for Buildings", value: 600 },
  ],
};

// Force simulation with fixed positions
const simulation = d3.forceSimulation(data.nodes)
  .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
  .force("charge", d3.forceManyBody().strength(-500))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .stop(); // Stop the simulation for manual node positioning

// Manually position the nodes for the desired layout
data.nodes.forEach(node => {
  switch (node.id) {
    case "Solar Panels":
      node.fx = 150;
      node.fy = 100;
      break;
    case "Thermophotovoltaics":
      node.fx = 150;
      node.fy = 200;
      break;
    case "Wind Turbines":
      node.fx = 250;
      node.fy = 150;
      break;
    case "Marine Hydrokinetic Turbines":
      node.fx = 300;
      node.fy = 250;
      break;
    case "Wave Energy Converters":
      node.fx = 300;
      node.fy = 350;
      break;
    case "Methanisation Plants":
      node.fx = 450;
      node.fy = 300;
      break;
    case "Urban Organic Waste":
      node.fx = 350;
      node.fy = 250;
      break;
    case "Sewage":
      node.fx = 350;
      node.fy = 350;
      break;
    case "Agricultural Organic Waste":
      node.fx = 350;
      node.fy = 450;
      break;
    case "District Heating Network":
      node.fx = 550;
      node.fy = 400;
      break;
    case "Urban Heat Recovery":
      node.fx = 450;
      node.fy = 450;
      break;
    case "Thermal Energy Storage":
      node.fx = 650;
      node.fy = 450;
      break;
    case "Gravitational Storage":
      node.fx = 450;
      node.fy = 100;
      break;
    case "Power2Gas":
      node.fx = 550;
      node.fy = 100;
      break;
    case "Small Nuclear Plant (SMR)":
      node.fx = 350;
      node.fy = 100;
      break;
    case "Backup and Energy Storage":
      node.fx = 500;
      node.fy = 200;
      break;
    case "Electricity Grid":
      node.fx = 700;
      node.fy = 300;
      break;
    case "Heat for Buildings":
      node.fx = 700;
      node.fy = 400;
      break;
  }
});

// Scales for visual representation
const edgeScale = d3.scaleLinear()
  .domain([0, 1200])
  .range([1, 10]);

const sizeScale = d3.scaleSqrt()
  .domain([0, 1200])
  .range([5, 25]);

// Draw links
const link = svg.append("g")
  .selectAll("line")
  .data(data.links)
  .join("line")
  .attr("stroke-width", d => edgeScale(d.value))
  .attr("stroke", "#999");

// Draw nodes
const node = svg.append("g")
  .selectAll("circle")
  .data(data.nodes)
  .join("circle")
  .attr("r", d => sizeScale(d.value))
  .attr("fill", d => {
    const groupColors = {
      Sun: "#FFD700",
      "Wind and Water": "#1E90FF",
      Waste: "#32CD32",
      Heat: "#FF4500",
      Storage: "#8A2BE2",
      Backup: "#A9A9A9",
      Output: "#FFA07A",
    };
    return groupColors[d.group] || "#ccc";
  })
  .on("mouseover", (event, d) => {
    tooltip.style("visibility", "visible")
      .html(`<b>${d.id}</b><br>Group: ${d.group}<br>Energy: ${d.value} GWh/year`);
  })
  .on("mousemove", event => {
    tooltip.style("top", `${event.pageY + 10}px`)
      .style("left", `${event.pageX + 10}px`);
  })
  .on("mouseout", () => {
    tooltip.style("visibility", "hidden");
  });

// Add node labels
svg.append("g")
  .selectAll("text")
  .data(data.nodes)
  .join("text")
  .attr("x", d => d.fx + 15)
  .attr("y", d => d.fy + 5)
  .text(d => d.id);
