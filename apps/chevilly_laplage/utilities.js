// utilities.js

/**
 * Validate if the required keys are present in the data object.
 * @param {Object} data - The data object to validate.
 * @param {Array} requiredKeys - The required keys to check.
 * @returns {boolean} - True if all required keys are present, otherwise false.
 */
function validateData(data, requiredKeys) {
  for (const key of requiredKeys) {
    if (!data[key]) {
      console.error(`Missing required key: ${key}`);
      return false;
    }
  }
  return true;
}

/**
 * Initialize an SVG element with specified dimensions and class.
 * @param {string} containerSelector - The selector for the container element.
 * @param {number} width - The width of the SVG.
 * @param {number} height - The height of the SVG.
 * @param {string} cssClass - The CSS class to add to the SVG.
 * @returns {Object} - The D3 SVG selection.
 */
function initializeSVG(containerSelector, width, height, cssClass) {
  return d3
    .select(containerSelector)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("class", cssClass);
}

/**
 * Create a tooltip element and return its selection.
 * @param {string} selector - The selector for the tooltip container.
 * @returns {Object} - The D3 selection for the tooltip.
 */
function createTooltip(selector) {
  return d3
    .select(selector)
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("z-index", 10)
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("border-radius", "5px")
    .style("padding", "10px")
    .style("font-size", "12px");
}

/**
 * Create a legend for the visualization.
 * @param {Object} svg - The D3 selection of the SVG.
 * @param {Array} groups - The group data for the legend.
 * @param {number} height - The height of the SVG.
 * @param {number} x - The x-position of the legend.
 * @param {number} yOffset - The y-offset from the bottom of the SVG.
 */
function createLegend(svg, groups, height, x = 30, yOffset = 150) {
  const legend = svg
    .append("g")
    .attr("transform", `translate(${x}, ${height - yOffset})`);

  legend
    .selectAll("rect")
    .data(groups)
    .join("rect")
    .attr("class", "legend-rect")
    .attr("x", 0)
    .attr("y", (d, i) => i * 20)
    .attr("width", 15)
    .attr("height", 15)
    .attr("fill", (d) => d.color);

  legend
    .selectAll("text")
    .data(groups)
    .join("text")
    .attr("class", "legend-text")
    .attr("x", 20)
    .attr("y", (d, i) => i * 20 + 12)
    .text((d) => d.name);
}

/**
 * Add a resize handler to update SVG dimensions and trigger a callback.
 * @param {Object} svg - The D3 selection of the SVG.
 * @param {Function} updateDimensions - The callback to handle dimension updates.
 */
function addResizeHandler(svg, updateDimensions) {
  window.addEventListener("resize", () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight - 40;
    svg.attr("width", newWidth).attr("height", newHeight);
    updateDimensions(newWidth, newHeight);
  });
}

// Export the utility functions
export { validateData, initializeSVG, createTooltip, createLegend, addResizeHandler };
