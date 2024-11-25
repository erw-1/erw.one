// Define SVG dimensions
const width = 960, height = 600;

// Tooltip for displaying information
const tooltip = d3.select("#tooltip");

// Create the SVG canvas
const svg = d3.select("svg")
  .attr("width", width)
  .attr("height", height);

// Example data
const data = {
  nodes: [
    { id: "Solar Panels", group: "Sun" },
    { id: "Thermophotovoltaics", group: "Sun" },
    { id: "Wind Turbines", group: "Wind and Water" },
    { id: "Marine Hydrokinetic Turbines", group: "Wind and Water" },
    { id: "Wave Energy Converters", group: "Wind and Water" },
    { id: "Methanisation Plants", group: "Waste" },
    { id: "Zero Waste Culture", group: "Waste" },
    { id: "District Heating Network", group: "Heat" },
    { id: "Urban Heat Recovery", group: "Heat" },
    { id: "Thermal Energy Storage", group: "Heat" },
    { id: "Gravitational Storage", group: "Storage" },
    { id: "Power2Gas", group: "Storage" },
    { id: "Small Nuclear Plant (SMR)", group: "Backup" },
    { id: "Electricity Grid", group: "Output" },
    { id: "Heat for Buildings", group: "Output" },
  ],
  links: [
    { source: "Solar Panels", target: "Electricity Grid" },
    { source: "Thermophotovoltaics", target: "Electricity Grid" },
    { source: "Wind Turbines", target: "Electricity Grid" },
    { source: "Marine Hydrokinetic Turbines", target: "Electricity Grid" },
    { source: "Wave Energy Converters", target: "Electricity Grid" },
    { source: "Methanisation Plants", target: "District Heating Network" },
    { source: "Zero Waste Culture", target: "Methanisation Plants" },
    { source: "Urban Heat Recovery", target: "District Heating Network" },
    { source: "Thermal Energy Storage", target: "District Heating Network" },
    { source: "Gravitational Storage", target: "Electricity Grid" },
    { source: "Power2Gas", target: "Electricity Grid" },
    { source: "Power2Gas", target: "District Heating Network" },
    { source: "Small Nuclear Plant (SMR)", target: "Electricity Grid" },
    { source: "District Heating Network", target: "Heat for Buildings" },
  ],
};

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
  .attr("stroke-width", 2);

// Draw nodes
const node = svg.append("g")
  .selectAll("circle")
  .data(data.nodes)
  .join("circle")
  .attr("r", 8)
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
      .text(`${d.id} (${d.group})`);
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
