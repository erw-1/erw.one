export const createGradient = (svg, link, colorMapping, idPrefix = "gradient") => {
  const defs = svg.append("defs");

  return link.map((d, i) => {
    const gradientId = `${idPrefix}-${i}`;
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("gradientUnits", "userSpaceOnUse");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", colorMapping[d.source.group]);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", colorMapping[d.target.group]);

    d.gradientId = gradientId;
    return `url(#${gradientId})`;
  });
};

export const createLegend = (svg, groups, config) => {
  const { x, yOffset, rectWidth, rectHeight, textXOffset, textYOffset, height } = config;

  const legend = svg
    .append("g")
    .attr("transform", `translate(${x}, ${height - yOffset})`);

  legend
    .selectAll("rect")
    .data(groups)
    .join("rect")
    .attr("x", 0)
    .attr("y", (d, i) => i * 20)
    .attr("width", rectWidth)
    .attr("height", rectHeight)
    .attr("fill", (d) => d.color);

  legend
    .selectAll("text")
    .data(groups)
    .join("text")
    .attr("x", textXOffset)
    .attr("y", (d, i) => i * 20 + textYOffset)
    .text((d) => d.name)
    .style("font-size", "12px")
    .style("fill", "#000");
};

export const handleResize = (svg, sankey, width, height) => {
  window.addEventListener("resize", () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight - 40;

    svg.attr("width", newWidth).attr("height", newHeight);

    if (sankey) {
      sankey.extent([
        [30, 5], // Maintain padding
        [newWidth - 1, newHeight - 5],
      ]);
    }
  });
};
