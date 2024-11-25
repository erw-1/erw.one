// Define SVG dimensions for full screen
const width = window.innerWidth;
const height = window.innerHeight;

// Tooltip for displaying information
const tooltip = d3.select("#tooltip");

// Create the SVG canvas
const svg = d3.select("body")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Load data from external JSON file
d3.json("data.json").then(data => {
  // Create a dictionary of colors based on the groups in the JSON file
  const groupColors = {};
  data.groups.forEach(group => {
    groupColors[group.name] = group.color;
  });

  // Scales for visual representation
  const edgeScale = d3.scaleLinear()
    .domain([0, 2200]) // Adjusted for central node
    .range([1, 10]);

  const sizeScale = d3.scaleSqrt()
    .domain([0, 2200]) // Adjusted for central node
    .range([5, 30]);

  // Force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // Draw links
  const link = svg.append("g")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("stroke-width", d => edgeScale(d.value))
    .attr("stroke", "#999");

  // Draw nodes
  const node = svg.append("g")
    .selectAll("circle")
    .data(data.nodes)
    .join("circle")
    .attr("r", d => sizeScale(d.value))
    .attr("fill", d => groupColors[d.group] || "#ccc")
    .call(drag(simulation))
    .on("mouseover", (event, d) => {
      tooltip.style("visibility", "visible")
        .html(`<b>${d.id}</b><br>Group: ${d.group}<br>Energy: ${d.value} GWh/year`);
    })
    .on("mousemove", event => {
      tooltip.style("top", `${event.pageY + 10}px`)
        .style("left", `${event.pageX + 10}px`);
    })
    .on("mouseout", () => {
      tooltip.style("visibility", "hidden");
    });

  // Add centered node labels
  const label = svg.append("g")
    .selectAll("text")
    .data(data.nodes)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em") // Center vertically
    .text(d => d.id)
    .style("pointer-events", "none") // Prevent interference with dragging
    .style("font-size", "12px") // Adjust font size for clarity
    .style("fill", "#000"); // Black text color

  // Add legend in the bottom-left corner
  const legend = svg.append("g")
    .attr("transform", `translate(20, ${height - 150})`);
  
  legend.selectAll("rect")
    .data(data.groups)
    .join("rect")
    .attr("x", 0)
    .attr("y", (d, i) => i * 20)
    .attr("width", 15)
    .attr("height", 15)
    .attr("fill", d => d.color);
  
  legend.selectAll("text")
    .data(data.groups)
    .join("text")
    .attr("x", 25) // Offset text to the right of the rectangle
    .attr("y", (d, i) => i * 20 + 12) // Align text vertically with the rectangles
    .text(d => d.name)
    .style("font-size", "12px")
    .style("font-family", "Poppins")
    .style("fill", "#000");

  // Update simulation
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

  // Drag functionality
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
});
