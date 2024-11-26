import {
  validateData,
  initializeSVG,
  createTooltip,
  createLegend,
  addResizeHandler,
} from "./utilities.js";

// Set up dimensions
const width = window.innerWidth;
const height = window.innerHeight;

// Initialize SVG
const svg = initializeSVG("#nodes-container", width, height, "node-visualization-svg");

// Create tooltip
const tooltip = createTooltip("#tooltip");

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

  // Set up scales
  const nodeSizeScale = d3
    .scaleSqrt()
    .domain(d3.extent(data.nodes, (d) => d.value))
    .range([5, 30]);

  const linkWidthScale = d3
    .scaleLinear()
    .domain(d3.extent(data.links, (d) => d.value))
    .range([1, 10]);

  // Add gradients for links
  const defs = svg.append("defs");
  data.links.forEach((link, i) => {
    const gradientId = `gradient-${i}`;
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", data.nodes.find((n) => n.id === link.source).x || 0)
      .attr("y1", data.nodes.find((n) => n.id === link.source).y || 0)
      .attr("x2", data.nodes.find((n) => n.id === link.target).x || 0)
      .attr("y2", data.nodes.find((n) => n.id === link.target).y || 0);

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", groupColors[data.nodes.find((n) => n.id === link.source).group]);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", groupColors[data.nodes.find((n) => n.id === link.target).group]);

    link.gradientId = gradientId;
  });

  // Initialize simulation
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
    .attr("class", "link-group")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("class", "link-line")
    .attr("stroke", (d) => `url(#${d.gradientId})`) // Use gradient links
    .attr("stroke-width", (d) => linkWidthScale(d.value));

  // Draw nodes
  const node = svg
    .append("g")
    .attr("class", "node-group")
    .selectAll("circle")
    .data(data.nodes)
    .join("circle")
    .attr("class", "node-circle")
    .attr("r", (d) => nodeSizeScale(d.value))
    .attr("fill", (d) => groupColors[d.group] || "#ccc") // No white outline
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
    .attr("class", "label-group")
    .selectAll("text")
    .data(data.nodes)
    .join("text")
    .attr("class", "node-label")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em")
    .text((d) => d.id);

  // Add legend with updated placement
  createLegend(svg, data.groups, height, 10, 200); // Legend is now 200px above bottom

  // Ticking function
  function ticked() {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    label.attr("x", (d) => d.x).attr("y", (d) => d.y);

    // Update gradient positions dynamically
    data.links.forEach((link) => {
      const gradient = defs.select(`#${link.gradientId}`);
      gradient
        .attr("x1", link.source.x)
        .attr("y1", link.source.y)
        .attr("x2", link.target.x)
        .attr("y2", link.target.y);
    });
  }

  // Dragging function
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

  // Handle window resizing
  addResizeHandler(svg, (newWidth, newHeight) => {
    simulation
      .force("center", d3.forceCenter(newWidth / 2, newHeight / 2))
      .alpha(0.3)
      .restart();
  });
});
