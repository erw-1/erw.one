import { createGradient, createLegend, handleResize } from "./shared-utils.js";

d3.json("data.json").then((data) => {
  const groupColors = {};
  data.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  const width = window.innerWidth;
  const height = window.innerHeight - 40;

  const svg = d3
    .select("#nodes-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const sizeScale = d3
    .scaleSqrt()
    .domain(d3.extent(data.nodes, (d) => d.value))
    .range([5, 30]);

  const edgeScale = d3
    .scaleLinear()
    .domain(d3.extent(data.links, (d) => d.value))
    .range([1, 10]);

  const gradients = createGradient(svg, data.links, groupColors, "node-gradient");

  const link = svg
    .append("g")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("stroke-width", (d) => edgeScale(d.value))
    .attr("stroke", (d, i) => gradients[i]);

  const node = svg
    .append("g")
    .selectAll("circle")
    .data(data.nodes)
    .join("circle")
    .attr("r", (d) => sizeScale(d.value))
    .attr("fill", (d) => groupColors[d.group]);

  createLegend(svg, data.groups, {
    ...config.legend,
    height,
  });

  handleResize(svg);
});
