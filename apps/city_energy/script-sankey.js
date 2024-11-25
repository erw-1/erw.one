// Configuration object for Sankey diagram
const sankeyConfig = {
  width: window.innerWidth,
  height: window.innerHeight,
  margin: { top: 10, right: 10, bottom: 10, left: 10 },
  nodeWidth: 20,
  nodePadding: 15,
  colorScale: d3.scaleOrdinal(d3.schemeCategory10)
};

// Define dimensions of the SVG container
const { width, height, margin, nodeWidth, nodePadding, colorScale } = sankeyConfig;

// Create the SVG canvas
const svg = d3.select("#sankey-container")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Create a Sankey generator
const sankey = d3.sankey()
  .nodeWidth(nodeWidth)
  .nodePadding(nodePadding)
  .size([width - margin.left - margin.right, height - margin.top - margin.bottom]);

// Load data from data.json
d3.json("data.json").then(data => {
  if (!data.nodes || !data.links) {
    console.error("JSON structure invalid: Ensure 'nodes' and 'links' are defined.");
    return;
  }

  // Pre-process the data for the Sankey generator
  const sankeyData = sankey({
    nodes: data.nodes.map(d => ({ ...d })),
    links: data.links.map(d => ({ ...d }))
  });

  // Draw links (connections between nodes)
  const link = svg.append("g")
    .selectAll(".link")
    .data(sankeyData.links)
    .join("path")
    .attr("class", "link")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke-width", d => Math.max(1, d.width))
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.5)
    .attr("fill", "none")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-opacity", 0.7);
    })
    .on("mouseout", function (event, d) {
      d3.select(this).attr("stroke-opacity", 0.5);
    });

  // Draw nodes
  const node = svg.append("g")
    .selectAll(".node")
    .data(sankeyData.nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x0}, ${d.y0})`);

  // Draw node rectangles
  node.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => colorScale(d.group))
    .attr("stroke", "#000")
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 2);
    })
    .on("mouseout", function (event, d) {
      d3.select(this).attr("stroke-width", 1);
    });

  // Add node labels
  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.id)
    .style("font-size", "12px")
    .style("fill", "#000");

  // Add tooltips
  const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("border-radius", "5px")
    .style("padding", "10px")
    .style("font-size", "12px");

  node.on("mouseover", (event, d) => {
    tooltip.style("visibility", "visible")
      .html(`<b>${d.id}</b><br>Value: ${d.value}`);
  }).on("mousemove", event => {
    tooltip.style("top", `${event.pageY + 10}px`)
      .style("left", `${event.pageX + 10}px`);
  }).on("mouseout", () => {
    tooltip.style("visibility", "hidden");
  });
});
