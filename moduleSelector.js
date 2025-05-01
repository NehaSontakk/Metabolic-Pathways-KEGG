// moduleSelector.js
import { renderGraph } from "./script.js";
// URLs for the JSON data
export const nodesURL = "https://raw.githubusercontent.com/NehaSontakk/Graph-Viz/refs/heads/main/all_module_nodes_sorted_by_group_Apr15.json"
export const adjacencyURL = "https://raw.githubusercontent.com/NehaSontakk/Graph-Viz/refs/heads/main/all_module_adjacency_links_Apr3.json"

// Utility to fetch JSON data
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Error fetching " + url);
  }
  return response.json();
}

// Listen for click events on the search button

document.getElementById("searchBtn").addEventListener("click", async () => {
  const moduleId = document.getElementById("moduleInput").value.trim();

  // Validate module id length (must be 6 characters)
  if (moduleId.length !== 6) {
    alert("Module ID must be exactly 6 characters long.");
    return;
  }

  try {
    // Fetch nodes and adjacency data concurrently
    const [allNodesData, allAdjacencyData] = await Promise.all([
      fetchJSON(nodesURL),
      fetchJSON(adjacencyURL)
    ]);

    // Get the nodes for the provided module id
    const moduleNodes = allNodesData[moduleId];
    if (!moduleNodes) {
      alert("Module not found in nodes data.");
      return;
    }

    // Ensure each node has a 'node-radius' property (default to 10)
    moduleNodes.forEach(node => {
      if (node['node-radius'] === undefined) {
        node['node-radius'] = 10;
      }
    });

    // Get the module-specific adjacency data and extract links
    const moduleAdjacency = allAdjacencyData[moduleId];
    if (!moduleAdjacency) {
      alert("Module not found in adjacency data.");
      return;
    }
    const moduleLinks = moduleAdjacency.links;

    // Call renderGraph (from script.js) with the module's nodes and links
    renderGraph(moduleNodes, moduleLinks);

  } catch (error) {
    console.error("Error loading module data:", error);
    alert("Error loading module data. Check console for details.");
  }
});
