// script-sankey.js
d3.json("data.json").then((data) => {
  if (!data.nodes || !data.links || !data.groups) {
    console.error(
      "JSON structure invalid: Ensure 'nodes', 'links', and 'groups' are defined."
    );
    return;
  }

  const groupColors = {};
  data.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  const width = window.innerWidth;
  const height = window.innerHeight - 40;

  const svg = d3
    .select("#sankey-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("class", "sankey-diagram-svg"); // Add CSS class

  const sankey = d3
    .sankey()
    .nodeId((d) => d.name)
    .nodeAlign(d3.sankeyJustify)
    .nodeWidth(15)
    .nodePadding(10)
    .extent([
      [30, 5],
      [width - 1, height - 5],
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
    .attr("class", "sankey-node-group") // Add CSS class
    .selectAll("rect")
    .data(sankeyData.nodes)
    .join("rect")
    .attr("class", "sankey-node") // Add CSS class
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .append("title")
    .text((d) => `${d.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  // Draw links
  svg
    .append("g")
    .attr("class", "sankey-link-group") // Add CSS class
    .selectAll("path")
    .data(sankeyData.links)
    .join("path")
    .attr("class", "sankey-link") // Add CSS class
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d) => `url(#${d.gradientId})`)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .append("title")
    .text((d) => `${d.source.name} → ${d.target.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  // Add labels
  svg
    .append("g")
    .attr("class", "sankey-label-group") // Add CSS class
    .selectAll("text")
    .data(sankeyData.nodes)
    .join("text")
    .attr("class", "sankey-label") // Add CSS class
    .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
    .text((d) => d.name);

  createLegend(svg, data.groups, height);

  function createLegend(svg, groups, height) {
    const legend = svg
      .append("g")
      .attr("transform", `translate(30, ${height - 150})`);

    legend
      .selectAll("rect")
      .data(groups)
      .join("rect")
      .attr("class", "legend-rect") // Add CSS class
      .attr("x", 0)
      .attr("y", (d, i) => i * 20)
      .attr("width", 15)
      .attr("height", 15)
      .attr("fill", (d) => d.color);

    legend
      .selectAll("text")
      .data(groups)
      .join("text")
      .attr("class", "legend-text") // Add CSS class
      .attr("x", 20)
      .attr("y", (d, i) => i * 20 + 12)
      .text((d) => d.name);
  }

  window.addEventListener("resize", () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight - 40;

    svg.attr("width", newWidth).attr("height", newHeight);

    sankey.extent([
      [30, 5],
      [newWidth - 1, newHeight - 5],
    ]);
  });
});
