// Configuration object
const config = {
  // SVG Dimensions
  width: window.innerWidth,
  height: window.innerHeight,

  // Tooltip configuration
  tooltip: {
    selector: "#tooltip",
    format: d => `
      <b>${d.id}</b><br>
      Group: ${d.group}<br>
      ${d.value} (GWh/year)
    `
  },

  // Simulation parameters
  simulation: {
    chargeStrength: -300,
    linkDistance: 150,
    nodeSizeRange: [5, 30],
    linkWidthRange: [1, 10],
  },

  // Legend positioning
  legend: {
    x: 20,
    yOffset: 150, // Distance from bottom
    rectWidth: 15,
    rectHeight: 15,
    textXOffset: 20,
    textYOffset: 12
  },

  // Link and node styling
  defaultLinkColor: "#999",
  defaultNodeColor: "#ccc",
  label: {
    fontSize: "12px",
    fill: "#000",
  },
};

// Define SVG dimensions
const { width, height } = config;

// Tooltip for displaying information
const tooltip = d3.select(config.tooltip.selector);

// Create the SVG canvas
const svg = d3.select("body")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Disable scrollwheel zoom and panning
svg.on("wheel", (event) => event.preventDefault());

// Load data from external JSON file
d3.json("data.json").then(data => {
  if (!data.nodes || !data.links || !data.groups) {
    console.error("JSON structure invalid: Ensure 'nodes', 'links', and 'groups' are defined.");
    return;
  }

  const groupColors = {};
  data.groups.forEach(group => {
    groupColors[group.name] = group.color;
  });

  const edgeScale = d3.scaleLinear()
    .domain(d3.extent(data.links, d => d.value))
    .range(config.simulation.linkWidthRange);

  const sizeScale = d3.scaleSqrt()
    .domain(d3.extent(data.nodes, d => d.value))
    .range(config.simulation.nodeSizeRange);

  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(config.simulation.linkDistance))
    .force("charge", d3.forceManyBody().strength(config.simulation.chargeStrength))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg.append("g")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("stroke-width", d => edgeScale(d.value))
    .attr("stroke", config.defaultLinkColor);

  const node = svg.append("g")
    .selectAll("circle")
    .data(data.nodes)
    .join("circle")
    .attr("r", d => sizeScale(d.value))
    .attr("fill", d => groupColors[d.group] || config.defaultNodeColor)
    .call(drag(simulation))
    .on("mouseover", (event, d) => {
      tooltip.style("visibility", "visible").html(config.tooltip.format(d));
    })
    .on("mousemove", event => {
      tooltip.style("top", `${event.pageY + 10}px`)
        .style("left", `${event.pageX + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("visibility", "hidden");
    });

  const label = svg.append("g")
    .selectAll("text")
    .data(data.nodes)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em")
    .text(d => d.id)
    .style("pointer-events", "none")
    .style("font-size", config.label.fontSize)
    .style("fill", config.label.fill);

  createLegend(svg, data.groups, height);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  function createLegend(svg, groups, height) {
    const legend = svg.append("g")
      .attr("transform", `translate(${config.legend.x}, ${height - config.legend.yOffset})`);

    legend.selectAll("rect")
      .data(groups)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d, i) => i * 20)
      .attr("class", "legend-rect")
      .attr("width", config.legend.rectWidth)
      .attr("height", config.legend.rectHeight)
      .attr("fill", d => d.color);

    legend.selectAll("text")
      .data(groups)
      .join("text")
      .attr("class", "legend-text")
      .attr("x", config.legend.textXOffset)
      .attr("y", (d, i) => i * 20 + config.legend.textYOffset)
      .text(d => d.name);
  }
});
