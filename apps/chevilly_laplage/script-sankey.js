(function () {
  const config = {
    width: window.innerWidth,
    height: window.innerHeight - 40, // Account for tab height
    tooltip: {
      selector: "#tooltip",
      format: (d) => `<b>${d.name}</b><br>${d.value} (GWh/year)`,
    },
    sankey: {
      nodeWidth: 15,
      nodePadding: 10,
      extent: [[30, 5], [window.innerWidth - 1, window.innerHeight - 45]], // Add padding
    },
    legend: {
      x: 30,
      yOffset: 150,
      rectWidth: 15,
      rectHeight: 15,
      textXOffset: 20,
      textYOffset: 12,
    },
  };

  const tooltip = d3.select(config.tooltip.selector);

  const svg = d3
    .select("#sankey-container")
    .append("svg")
    .attr("width", config.width)
    .attr("height", config.height)
    .attr("viewBox", [0, 0, config.width, config.height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  d3.json("data.json").then((data) => {
    const groupColors = {};
    data.groups.forEach((group) => {
      groupColors[group.name] = group.color;
    });

    const sankey = d3
      .sankey()
      .nodeId((d) => d.name)
      .nodeAlign(d3.sankeyJustify)
      .nodeWidth(config.sankey.nodeWidth)
      .nodePadding(config.sankey.nodePadding)
      .extent(config.sankey.extent);

    const { nodes, links } = sankey({
      nodes: data.nodes.map((d) => ({ ...d, color: groupColors[d.group] })),
      links: data.links,
    });

    const defs = svg.append("defs");

    links.forEach((link, i) => {
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
      .data(nodes)
      .join("rect")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("width", d3.sankey().nodeWidth())
      .attr("fill", (d) => d.color)
      .on("mouseover", (event, d) => {
        tooltip.style("visibility", "visible").html(config.tooltip.format(d));
      })
      .on("mousemove", (event) => {
        tooltip
          .style("top", `${event.pageY + 10}px`)
          .style("left", `${event.pageX + 10}px`);
      })
      .on("mouseout", () => {
        tooltip.style("visibility", "hidden");
      });

    svg
      .append("g")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.5)
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", (d) => `url(#${d.gradientId})`)
      .attr("stroke-width", (d) => Math.max(1, d.width))
      .append("title")
      .text((d) => `${d.source.name} → ${d.target.name}\n${d.value} GWh/year`);

    svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .attr("x", (d) => (d.x0 < config.width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr("y", (d) => (d.y0 + d.y1) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.x0 < config.width / 2 ? "start" : "end"))
      .text((d) => d.name);

    createLegend(svg, data.groups, config.height);

    function createLegend(svg, groups, height) {
      const legend = svg
        .append("g")
        .attr("transform", `translate(${config.legend.x}, ${height - config.legend.yOffset})`);

      legend
        .selectAll("rect")
        .data(groups)
        .join("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 20)
        .attr("width", config.legend.rectWidth)
        .attr("height", config.legend.rectHeight)
        .attr("fill", (d) => d.color);

      legend
        .selectAll("text")
        .data(groups)
        .join("text")
        .attr("x", config.legend.textXOffset)
        .attr("y", (d, i) => i * 20 + config.legend.textYOffset)
        .text((d) => d.name);
    }

    window.addEventListener("resize", () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight - 40;

      svg.attr("width", newWidth).attr("height", newHeight);

      sankey.extent([[30, 5], [newWidth - 1, newHeight - 5]]);
    });
  });
})();
