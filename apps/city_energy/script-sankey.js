(function () {
  // Configuration for the Sankey diagram
  const sankeyConfig = {
    width: window.innerWidth,
    height: window.innerHeight,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
    nodeWidth: 15,
    nodePadding: 20,
    colorScale: d3.scaleOrdinal(d3.schemeCategory10),
  };

  // Define dimensions for the SVG container
  const {
    width,
    height,
    margin,
    nodeWidth,
    nodePadding,
    colorScale,
  } = sankeyConfig;

  // Select the container for the Sankey diagram
  const sankeyContainer = d3.select("#sankey-container");

  // Create an SVG element inside the container
  const svg = sankeyContainer
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Initialize the Sankey generator
  const sankey = d3
    .sankey()
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .size([width - margin.left - margin.right, height - margin.top - margin.bottom]);

  // Load data from the JSON file
  d3.json("data.json").then((data) => {
    if (!data.nodes || !data.links) {
      console.error("Invalid data structure: Ensure 'nodes' and 'links' exist.");
      return;
    }

    const sankeyData = sankey({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => {
        if (!data.nodes.some((node) => node.id === d.source)) {
          console.error(`Missing source node: ${d.source}`);
        }
        if (!data.nodes.some((node) => node.id === d.target)) {
          console.error(`Missing target node: ${d.target}`);
        }
        return { ...d };
      }),
    });

    // Draw the links (flows between nodes)
    svg.append("g")
      .selectAll(".link")
      .data(sankeyData.links)
      .join("path")
      .attr("class", "link")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", "#999")
      .attr("stroke-width", (d) => Math.max(1, d.width))
      .attr("fill", "none")
      .attr("stroke-opacity", 0.4)
      .on("mouseover", function () {
        d3.select(this).attr("stroke-opacity", 0.7);
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke-opacity", 0.4);
      });

    // Draw the nodes (boxes)
    const node = svg
      .append("g")
      .selectAll(".node")
      .data(sankeyData.nodes)
      .join("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    // Draw the node rectangles
    node
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("fill", (d) => colorScale(d.group || d.id))
      .attr("stroke", "#000")
      .attr("stroke-width", 1)
      .on("mouseover", function () {
        d3.select(this).attr("stroke-width", 2);
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke-width", 1);
      });

    // Add node labels
    node
      .append("text")
      .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr("y", (d) => (d.y1 + d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
      .text((d) => d.id)
      .style("font-size", "12px")
      .style("fill", "#000");

    // Tooltip for interactivity
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("padding", "10px")
      .style("border-radius", "5px");

    node
      .on("mouseover", (event, d) => {
        tooltip.style("visibility", "visible").html(`
      <b>${d.id}</b><br>
      Value: ${d.value}
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
  });
})();
