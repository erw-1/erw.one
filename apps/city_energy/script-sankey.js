import { config } from "./config.js";
import { createGradient, createLegend, handleResize } from "./shared-utils.js";

d3.json("data.json").then((data) => {
  const groupColors = {};
  data.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  const svg = d3
    .select("#sankey-container")
    .append("svg")
    .attr("width", config.width)
    .attr("height", config.height)
    .attr("viewBox", [0, 0, config.width, config.height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  const sankey = d3
    .sankey()
    .nodeId((d) => d.name)
    .nodeAlign(d3.sankeyJustify)
    .nodeWidth(15)
    .nodePadding(10)
    .extent([
      [30, 5],
      [config.width - 1, config.height - 5],
    ]);

  const { nodes, links } = sankey({
    nodes: data.nodes.map((d) => Object.assign({}, d)),
    links: data.links.map((d) => Object.assign({}, d)),
  });

  const gradients = createGradient(svg, links, groupColors, "sankey-gradient");

  svg
    .append("g")
    .selectAll("rect")
    .data(nodes)
    .join("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", (d) => d.color);

  svg
    .append("g")
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d, i) => gradients[i])
    .attr("stroke-width", (d) => Math.max(1, d.width));

  createLegend(svg, data.groups, {
    ...config.legend,
    height: config.height,
  });

  handleResize(svg, sankey);
});
