// script-nodes.js
d3.json("data.json").then((data) => {
  // Validate data
  if (!data.nodes || !data.links || !data.groups) {
    console.error(
      "JSON structure invalid: Ensure 'nodes', 'links', and 'groups' are defined."
    );
    return;
  }

  // Extract configuration
  const groupColors = {};
  data.groups.forEach((group) => {
    groupColors[group.name] = group.color;
  });

  const width = window.innerWidth;
  const height = window.innerHeight;

  const svg = d3
    .select("#nodes-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("font", "10px sans-serif");

  const tooltip = d3
    .select("#tooltip")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("border-radius", "5px")
    .style("padding", "10px")
    .style("font-size", "12px")
    .style("z-index", 10);

  const nodeSizeScale = d3
    .scaleSqrt()
    .domain(d3.extent(data.nodes, (d) => d.value))
    .range([5, 30]);

  const linkWidthScale = d3
    .scaleLinear()
    .domain(d3.extent(data.links, (d) => d.value))
    .range([1, 10]);

  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3
        .forceLink(data.links)
        .id((d) => d.id)
        .distance(150)
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", ticked);

  // Draw links
  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("stroke-width", (d) => linkWidthScale(d.value));

  // Draw nodes
  const node = svg
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(data.nodes)
    .join("circle")
    .attr("r", (d) => nodeSizeScale(d.value))
    .attr("fill", (d) => groupColors[d.group] || "#ccc")
    .call(drag(simulation))
    .on("mouseover", (event, d) => {
      tooltip.style("visibility", "visible").html(`
        <b>${d.id}</b><br>
        Group: ${d.group}<br>
        ${d.value} (GWh/year)
      `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("top", `${event.pageY + 10}px`)
        .style("left", `${event.pageX + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("visibility", "hidden");
    });

  // Draw labels
  const label = svg
    .append("g")
    .selectAll("text")
    .data(data.nodes)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em")
    .text((d) => d.id)
    .style("pointer-events", "none");

  // Add legend
  createLegend(svg, data.groups, height);

  // Functions
  function ticked() {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    label.attr("x", (d) => d.x).attr("y", (d) => d.y);
  }

  function drag(simulation) {
    return d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  function createLegend(svg, groups, height) {
    const legend = svg
      .append("g")
      .attr("transform", `translate(20, ${height - 150})`);

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
      .style("font-size", "12px");
  }
});
