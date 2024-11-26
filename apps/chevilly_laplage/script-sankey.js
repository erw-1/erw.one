import {
  validateData,
  initializeSVG,
  createTooltip,
  createLegend,
  addResizeHandler,
} from "./utilities.js";

// Set up dimensions
const width = window.innerWidth;
const height = window.innerHeight - 40; // Adjust for tab height

// Initialize SVG
const svg = initializeSVG("#sankey-container", width, height, "sankey-diagram-svg");

// Load data and visualize
d3.json("data.json").then((data) => {
  // Validate data structure
  if (!validateData(data, ["nodes", "links", "groups"])) {
    return;
  }

  const groupColors = {};
  data.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  // Set up Sankey generator with space for the legend
  const sankey = d3
    .sankey()
    .nodeId((d) => d.name)
    .nodeAlign(d3.sankeyJustify)
    .nodeWidth(15)
    .nodePadding(10)
    .extent([
      [200, 50], // Leave 200px space on the left for the legend
      [width - 5, height - 50], // Keep 50px margin at the top and bottom
    ]);

  const sankeyData = sankey({
    nodes: data.nodes.map((node) => ({
      name: node.id,
      category: node.group,
      value: node.value,
      color: groupColors[node.group],
    })),
    links: data.links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
    })),
  });

  // Create gradients for links
  const defs = svg.append("defs");
  sankeyData.links.forEach((link, i) => {
    const gradientId = `gradient-${i}`;
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", link.source.x1)
      .attr("x2", link.target.x0)
      .attr("y1", (link.source.y0 + link.source.y1) / 2)
      .attr("y2", (link.target.y0 + link.target.y1) / 2);

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", link.source.color);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", link.target.color);

    link.gradientId = gradientId;
  });

  // Draw nodes
  svg
    .append("g")
    .attr("class", "sankey-node-group")
    .selectAll("rect")
    .data(sankeyData.nodes)
    .join("rect")
    .attr("class", "sankey-node")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", (d) => d.color) // Fix black node issue
    .append("title")
    .text((d) => `${d.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  // Draw links
  svg
    .append("g")
    .attr("class", "sankey-link-group")
    .selectAll("path")
    .data(sankeyData.links)
    .join("path")
    .attr("class", "sankey-link")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d) => `url(#${d.gradientId})`)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .append("title")
    .text((d) => `${d.source.name} → ${d.target.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  // Add labels
  svg
    .append("g")
    .attr("class", "sankey-label-group")
    .selectAll("text")
    .data(sankeyData.nodes)
    .join("text")
    .attr("class", "sankey-label")
    .attr("x", (d) => {
      const buffer = 10; // Ensure padding from edges
      if (d.x0 < width / 2) return Math.min(d.x1 + 6, width - buffer); // Right side
      return Math.max(d.x0 - 6, buffer); // Left side
    })
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
    .text((d) => d.name);

  // Add legend
  createLegend(svg, data.groups, height, 10, 200); // Legend is now 200px above bottom

  // Handle window resizing
  addResizeHandler(svg, (newWidth, newHeight) => {
    sankey.extent([
      [200, 50],
      [newWidth - 5, newHeight - 50],
    ]);
  });
});
