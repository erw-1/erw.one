// Define SVG dimensions
const width = 960, height = 600;

// Tooltip for displaying information
const tooltip = d3.select("#tooltip");

// Create the SVG canvas
const svg = d3.select("svg")
  .attr("width", width)
  .attr("height", height);

// Updated data with new inputs for Methanisation
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
    { source: "Methanisation Plants", target: "District Heating Network", value: 400 }, // Heat from methanisation
    { source: "Methanisation Plants", target: "Electricity Grid", value: 600 }, // Electricity generation
    { source: "Methanisation Plants", target: "Backup and Energy Storage", value: 200 }, // Methane storage
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

// Scales for visual representation
const edgeScale = d3.scaleLinear()
  .domain([0, 1200]) // Adjusted domain for Methanisation role
  .range([1, 10]);

const sizeScale = d3.scaleSqrt()
  .domain([0, 1200]) // Adjusted domain for Methanisation role
  .range([5, 25]);

// Create a force simulation
const simulation = d3.forceSimulation(data.nodes)
  .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
  .force("charge", d3.forceManyBody().strength(-300))
  .force("center", d3.forceCenter(width / 2, height / 2));

// Draw links
const link = svg.append("g")
  .selectAll("line")
  .data(data.links)
  .join("line")
  .attr("class", "link")
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
  .call(drag(simulation))
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
const label = svg.append("g")
  .selectAll("text")
  .data(data.nodes)
  .join("text")
  .attr("x", 12)
  .attr("y", 3)
  .text(d => d.id);

// Update simulation
simulation.on("tick", () => {
  link
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  node
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);

  label
    .attr("x", d => d.x + 10)
    .attr("y", d => d.y + 5);
});

// Drag functionality
function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}