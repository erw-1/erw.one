// Load and fix the data
d3.json("data.json").then((originalData) => {
  // Transform nodes: map 'id' to 'name' and add 'category'
  const nodes = originalData.nodes.map((node) => ({
    name: node.id, // Rename 'id' to 'name'
    category: node.group || node.id.split(" ")[0], // Use 'group' or the first word of 'id'
    value: node.value // Retain value for visualization
  }));

  // Validate and filter links
  const nodeNames = new Set(nodes.map((node) => node.name));
  const links = originalData.links.filter((link) => {
    const validSource = nodeNames.has(link.source);
    const validTarget = nodeNames.has(link.target);
    if (!validSource) console.warn(`Missing source node: ${link.source}`);
    if (!validTarget) console.warn(`Missing target node: ${link.target}`);
    return validSource && validTarget;
  });

  // Log the transformed data
  const fixedData = { nodes, links };
  console.log("Fixed Data:", fixedData);

  // Use this data to render the Sankey diagram
  drawSankey(fixedData);
});

// Sankey diagram logic
function drawSankey(data) {
  const width = 928;
  const height = 600;
  const format = d3.format(",.0f");

  const svg = d3
    .select("#sankey-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  const sankey = d3
    .sankey()
    .nodeId((d) => d.name)
    .nodeAlign(d3.sankeyJustify)
    .nodeWidth(15)
    .nodePadding(10)
    .extent([
      [1, 5],
      [width - 1, height - 5],
    ]);

  const { nodes, links } = sankey({
    nodes: data.nodes.map((d) => Object.assign({}, d)),
    links: data.links.map((d) => Object.assign({}, d)),
  });

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  svg
    .append("g")
    .selectAll("rect")
    .data(nodes)
    .join("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", (d) => color(d.category))
    .append("title")
    .text((d) => `${d.name}\n${format(d.value)}`);

  const link = svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.5)
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d) => color(d.source.category))
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .append("title")
    .text(
      (d) =>
        `${d.source.name} → ${d.target.name}\n${format(d.value)}`
    );

  svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr("y", (d) => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) =>
      d.x0 < width / 2 ? "start" : "end"
    )
    .text((d) => d.name);
}
