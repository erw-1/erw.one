d3.json("data.json").then((originalData) => {
  const groupColors = {};
  originalData.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  const nodes = originalData.nodes.map((node) => ({
    name: node.id,
    category: node.group || node.id.split(" ")[0],
    value: node.value,
    color: groupColors[node.group],
  }));

  const links = originalData.links.map((link) => ({
    source: link.source,
    target: link.target,
    value: link.value,
  }));

  const width = window.innerWidth;
  const height = window.innerHeight - 40; // Account for tab height

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
      [300, 5], // Add 30px left padding
      [width - 1, height - 5],
    ]);

  const { nodes: sankeyNodes, links: sankeyLinks } = sankey({
    nodes: nodes.map((d) => Object.assign({}, d)),
    links: links.map((d) => Object.assign({}, d)),
  });

  const defs = svg.append("defs");

  sankeyLinks.forEach((link, i) => {
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

  svg
    .append("g")
    .selectAll("rect")
    .data(sankeyNodes)
    .join("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", (d) => d.color)
    .append("title")
    .text((d) => `${d.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.5)
    .selectAll("path")
    .data(sankeyLinks)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d) => `url(#${d.gradientId})`)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .append("title")
    .text((d) => `${d.source.name} → ${d.target.name}\n${d3.format(",.0f")(d.value)} GWh/year`);

  svg
    .append("g")
    .selectAll("text")
    .data(sankeyNodes)
    .join("text")
    .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
    .text((d) => d.name)
    .each(function (d) {
      const bbox = this.getBBox();
      if (d.y0 + bbox.height > height) {
        d3.select(this).attr("y", height - bbox.height - 5); // Prevent cut-off
      }
    });

  createLegend(svg, originalData.groups, height);

  function createLegend(svg, groups, height) {
    const legend = svg
      .append("g")
      .attr("transform", `translate(30, ${height - 150})`); // Ensure padding from the Sankey

    legend
      .selectAll("rect")
      .data(groups)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d, i) => i * 20)
      .attr("width", 15)
      .attr("height", 15)
      .attr("fill", (d) => d.color);

    legend
      .selectAll("text")
      .data(groups)
      .join("text")
      .attr("x", 20)
      .attr("y", (d, i) => i * 20 + 12)
      .text((d) => d.name)
      .style("font-size", "12px")
      .style("fill", "#000")
      .style("text-anchor", "start");
  }

  window.addEventListener("resize", () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight - 40;

    svg.attr("width", newWidth).attr("height", newHeight);

    sankey.extent([
      [30, 5], // Maintain padding
      [newWidth - 1, newHeight - 5],
    ]);
  });
});
