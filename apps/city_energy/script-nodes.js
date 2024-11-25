// Define SVG dimensions for full screen
const width = window.innerWidth;
const height = window.innerHeight;

// Tooltip for displaying information
const tooltip = d3.select("#tooltip");

// Create the SVG canvas
const svg = d3.select("body")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Ensure parent nodes' values are the sum of their children
const data = {
  nodes: [
    { id: "Chevilly-la-Plage's Energetic Mix", group: "Central", value: 2200 },
    { id: "Solar Panels", group: "Sun", value: 875 },
    { id: "Thermophotovoltaics", group: "Sun", value: 100 },
    { id: "Wind Turbines", group: "Wind and Water", value: 500 },
    { id: "Marine Hydrokinetic Turbines", group: "Wind and Water", value: 75 },
    { id: "Wave Energy Converters", group: "Wind and Water", value: 50 },
    { id: "Methanisation Plants", group: "Waste", value: 1200 },
    { id: "Urban Organic Waste", group: "Waste", value: 500 },
    { id: "Sewage", group: "Waste", value: 400 },
    { id: "Agricultural Organic Waste", group: "Waste", value: 300 },
    { id: "District Heating Network", group: "Heat", value: 750 }, // Includes Urban Heat Recovery and Thermal Energy Storage
    { id: "Urban Heat Recovery", group: "Heat", value: 200 },
    { id: "Thermal Energy Storage", group: "Heat", value: 150 },
    { id: "Heat for Buildings", group: "Heat", value: 600 },
    { id: "Electricity Grid", group: "Electricity", value: 1600 }, // Includes Methanisation output
    { id: "Gravitational Storage", group: "Backup", value: 100 },
    { id: "Power2Gas", group: "Backup", value: 200 },
    { id: "Small Nuclear Plant (SMR)", group: "Backup", value: 50 },
    { id: "Backup and Energy Storage", group: "Backup", value: 350 }, // Sum of Backup components
  ],
  links: [
    { source: "Electricity Grid", target: "Chevilly-la-Plage's Energetic Mix", value: 1600 },
    { source: "District Heating Network", target: "Chevilly-la-Plage's Energetic Mix", value: 600 },
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
    { source: "Urban Heat Recovery", target: "District Heating Network", value: 200 },
    { source: "Thermal Energy Storage", target: "District Heating Network", value: 150 },
    { source: "Gravitational Storage", target: "Backup and Energy Storage", value: 100 },
    { source: "Power2Gas", target: "Backup and Energy Storage", value: 200 },
    { source: "Small Nuclear Plant (SMR)", target: "Backup and Energy Storage", value: 50 },
    { source: "Backup and Energy Storage", target: "Electricity Grid", value: 250 },
    { source: "District Heating Network", target: "Heat for Buildings", value: 600 },
  ],
};

// Scales for visual representation
const edgeScale = d3.scaleLinear()
  .domain([0, 2200]) // Adjusted for central node
  .range([1, 10]);

const sizeScale = d3.scaleSqrt()
  .domain([0, 2200]) // Adjusted for central node
  .range([5, 30]);

// Force simulation
const simulation = d3.forceSimulation(data.nodes)
  .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
  .force("charge", d3.forceManyBody().strength(-300))
  .force("center", d3.forceCenter(width / 2, height / 2));

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
      Electricity: "#87CEEB",
      Backup: "#A9A9A9",
      Central: "#FFC0CB", // Pink for central node
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

// Add centered node labels
const label = svg.append("g")
  .selectAll("text")
  .data(data.nodes)
  .join("text")
  .attr("text-anchor", "middle")
  .attr("dy", ".35em") // Center vertically
  .text(d => d.id)
  .style("pointer-events", "none") // Prevent interference with dragging
  .style("font-size", "12px") // Adjust font size for clarity
  .style("fill", "#000"); // Black text color

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
    .attr("x", d => d.x)
    .attr("y", d => d.y);
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
