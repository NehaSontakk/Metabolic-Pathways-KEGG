// script.js
import { parseCSV, stripNodeID } from "./fileProcessing.js";
import { nodesURL, adjacencyURL } from "./moduleSelector.js";
let koMap = null; 

// Define dimensions and margins for the SVG
const width = 1000,
      height = 1000;
const margin = { top: 20, right: 100, bottom: 20, left: 50 };


let svg;       // Global svg selection (will be created in renderGraph)
let linkGroup; // Group for links
let nodeGroup; // Group for nodes

let highlightedNodes = new Set();
let highlightedLinks = new Set();
const selected        = new Set();   // <‑‑ NEW  multi‑selection

let currentLinks  = [];              // already added in previous patch
let currentNodes  = [];              // we’ll keep this too (for lookup)

const MAX_SVG_W   = 1750;
const BASE_SVG_H  = 1200;   // constant height
const TOP_OFFSET  = 100;          // total svg height (px)
const PAD_T  = 20;            // interior padding  (top,  left,  right,  bottom)
const PAD_R  = 250;
const PAD_B  = 20;
const PAD_L  = 300;

const LABEL_GAP = 10;            // distance from left edge of graph
const labelX    = PAD_L - LABEL_GAP;   // always ≥ 0, so it stays in the SVG

// Compute dimensions that fit *this* window:
function getSvgDims() {
  // viewport width minus 20 px breathing room
  const w = Math.min(MAX_SVG_W, window.innerWidth - 20);
  return { w, h: BASE_SVG_H };
}

// Main render function called with module-specific nodes and links
export function renderGraph(nodes, links) {
  currentNodes = nodes;
  currentLinks = links;
  // Clear any existing graph content
  
  const { w: SVG_W, h: SVG_H } = getSvgDims();

  d3.select("#graph-container").html("");
  svg = d3.select("#graph-container")
          .append("svg")
          .attr("width",  SVG_W)
          .attr("height", SVG_H)
          .style("overflow", "visible")
          .style("display", "block")
          .style("margin", `${TOP_OFFSET}px auto 0`)   // ← auto centres
          .attr("viewBox", `0 0 ${SVG_W} ${SVG_H}`)    // optional: zoom if you resize
          .append("g");


  // Define arrow markers for directed edges
  svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 35)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', 'currentColor')
      .style('stroke','none');

  // Create separate groups for links and nodes
  linkGroup = svg.append("g").attr("class", "links");
  nodeGroup = svg.append("g").attr("class", "nodes");

  //sugiyamaLayout(nodes, links, /* nodeWidth= */ 50, /* nodeHeight= */ 50);
  const g = sugiyamaLayout(nodes, links); 

  // Plot nodes and legends
  plotNodes(nodes);
  addLegends(SVG_W);

  // Plot links using the provided nodes for lookup
  //plotLinks(links, nodes);
  plotLinks(links, nodes, g);
}

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("position", "absolute")
  .style("background", "rgba(255,255,255,0.9)")
  .style("padding", "6px")
  .style("border", "1px solid #ccc")
  .style("border-radius", "4px")
  .style("pointer-events", "none")
  .style("opacity", 0);

  document.getElementById("fileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) {
      koMap = null; // No file uploaded
      return;
    }
  
    try {
      const text = await file.text();
      // parseCSV is from fileProcessing.js
      koMap = await parseCSV(text);
      console.log("Parsed CSV into Map:", koMap);
    } catch (err) {
      console.error("Error reading CSV file:", err);
      koMap = null;
    }
  });

// Function to plot nodes and add node & group labels
function plotNodes(nodes) {
  const innerWidth = 650;
  const xStart = margin.left + ((width - margin.left - margin.right) - innerWidth) / 2;  // centers the innerWidth region
  const xEnd = xStart + innerWidth;

  const nodesByGroup = d3.group(nodes, d => d.group);
  const maxCount = d3.max(Array.from(nodesByGroup.values(), groupNodes => groupNodes.length));

  const globalXScale = d3.scaleLinear()
    .domain([0, maxCount - 1])
    .range([xStart, xEnd]);

  const groups = Array.from(nodesByGroup.keys());
  const yScale = d3.scalePoint()
    .domain(groups)
    .range([margin.top, height - margin.bottom])
    .padding(1);

  const radiusScale = d3.scaleLinear()
    .domain(d3.extent(nodes, d => d.KO_Occurrence))
    .range([5, 20]);

  const minNodeOccurrence = d3.min(nodes, d => d.KO_Occurrence);
  const maxNodeOccurrence = d3.max(nodes, d => d.KO_Occurrence);

  // Create a color scale for nodes
  const nodeColorScale = d3.scaleSequential(t => d3.interpolateGreys(0.3 + 0.8 * t))
    .domain([minNodeOccurrence, maxNodeOccurrence]);

  const groupToY = d3.rollup(
    nodes,                       // ← nodes now carry final .y
    v => d3.mean(v, n => n.y),   //   average y for this layer
    n => n.group                 //   key = layer / step
  );
  
  // convert Map → array of [group, y] tuples (sorted by group)
  const layerPositions = Array.from(groupToY, ([grp, y]) => ({grp, y}))
                                .sort((a, b) => d3.ascending(a.grp, b.grp));

  nodeGroup.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => radiusScale(d.KO_Occurrence) || d["node-radius"] || 10)
    .attr("stroke", function (d) {
        d.baseStroke   = "black"; 
        d.baseStrokeW  = 1;
        return d.baseStroke;
     })
    .attr("stroke-width", d => d.baseStrokeW)
    .attr("fill", d => {
      if (!koMap) {
        return nodeColorScale(d.KO_Occurrence) || "#071330";
      }

      const stripped = stripNodeID(d.id);  // from fileProcessing.js
      if (koMap.has(stripped)) {
        const eValue = koMap.get(stripped);
        return eValue > 1e-5 ? "#91BAD6" : "pink";
      } else {
        return nodeColorScale(d.KO_Occurrence) || "#071330";
      }
    })
    .on("mouseover", (event, d) => {
      tooltip.transition().duration(200).style("opacity", 0.9);
      let tooltipText;
      if (koMap) {
        const stripped = stripNodeID(d.id);
        if (koMap.has(stripped)) {
          const eValue = koMap.get(stripped);
          tooltipText = `Node Occurrence: ${d.KO_Occurrence}\nE-value: ${eValue}`;
        } else {
          tooltipText = `Node Occurrence: ${d.KO_Occurrence}`;
        }
      } else {
        tooltipText = `Node Occurrence: ${d.KO_Occurrence}`;
      }
      tooltip.html(tooltipText)
        .style("left", (event.pageX + 5) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", () => {
      tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", (event, d) => {

      if (event.ctrlKey || event.metaKey) {
        if (selected.has(d.id)) selected.delete(d.id);
        else                    selected.add(d.id);
        updateSelectionStyling();
        highlightAllSelectedPaths();    
        return;
      }
      // Single Click 
      selected.clear();
      selected.add(d.id);
      updateSelectionStyling();
      highlightAllSelectedPaths();

     })
    

  // Append text labels for each node
  nodeGroup.selectAll('text.node-label')
    .data(nodes)
    .enter()
    .append('text')
    .attr('class', 'node-label')
    .attr('x', d => d.x - 20)
    .attr('y', d => d.y - 25)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .text(d => d.id)
    .attr('font-size', '11px')
    .attr('fill', 'black');

  // 7. Append group labels along the left
  svg.selectAll("text.group-label")
   .data(layerPositions)
   .join("text")
     .attr("class", "group-label")
     .attr("x", labelX)                //  ❰ –25 px ❱  outside SVG
     .attr("y", d => d.y)
     .attr("text-anchor", "end")
     .attr("dominant-baseline", "middle")
     .attr("font-size", 14)
     .attr("fill", "black")
     .text(d => `Step ${d.grp}`);
}

// 5. On search button click, fetch the nodes and adjacency for the input module ID
document.getElementById("searchBtn").addEventListener("click", async () => {
  const moduleId = document.getElementById("moduleInput").value.trim();
  if (moduleId.length !== 6) {
    alert("Module ID must be exactly 6 characters long.");
    return;
  }
  try {
    const [allNodesData, allAdjData] = await Promise.all([
      fetchJSON(nodesURL),
      fetchJSON(adjacencyURL)
    ]);
    const moduleNodes = allNodesData[moduleId];
    if (!moduleNodes) {
      alert("Module not found in nodes data.");
      return;
    }
    const moduleLinks = allAdjData[moduleId]?.links || [];
    renderGraph(moduleNodes, moduleLinks);
  } catch (error) {
    console.error("Error loading module data:", error);
  }
});

// 6. Utility to fetch JSON
async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Error fetching: " + url);
  return resp.json();
}

// Function to plot links between nodes
// Function to plot links between nodes
function plotLinks(links, nodes) {
  // Create a map for quick node lookup by id
  const nodeById = new Map(nodes.map(d => [d.id, d]));

  // Define a scale for edge widths based on edge_weight
  const weightScale = d3.scaleLinear()
    .domain([1, 15])
    .range([1, 10]);

  // Sort links by edge_weight ascending (thicker edges appear on top)
  links.sort((a, b) => a['edge_weight'] - b['edge_weight']);

  const minOccurrence = d3.min(links, d => d.edge_occurence);
  const maxOccurrence = d3.max(links, d => d.edge_occurence);
  console.log(minOccurrence);

  // Create a color scale (e.g., from light blue to dark blue).
  const edgeColorScale = d3.scaleSequential(t => d3.interpolateGreys(0.5 + 0.8 * t))
    .domain([minOccurrence, maxOccurrence]);

  // Create a width scale (e.g., stroke width from 1 to 5 pixels).
  const edgeWidthScale = d3.scaleLinear()
    .domain([minOccurrence, maxOccurrence])
    .range([1, 3]);

  // inside plotLinks (after you build nodeById)
    const edgeLine = d3.line()          // converts array → "M … L …"
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveStep);             // crisp 90‑degree corners


  // Bind data to lines within the link group
  linkGroup.selectAll('line.link')
    .data(links)
    .enter()
    .append('line')
    .attr('class', 'link')
    //.attr('x1', d => {const sourceNode = nodeById.get(d.source);return sourceNode ? sourceNode.x : 0;})
    //.attr('y1', d => {
    //  const sourceNode = nodeById.get(d.source);
    //  return sourceNode ? sourceNode.y : 0;
    //})
    //.attr('x2', d => {
    //  const targetNode = nodeById.get(d.target);
    //  return targetNode ? targetNode.x : 0;
    //})
    //.attr('y2', d => {
    //  const targetNode = nodeById.get(d.target);
    //  return targetNode ? targetNode.y : 0;
    //})
    .attr('x1', d => nodeById.get(d.source).x)
    .attr('y1', d => nodeById.get(d.source).y)
    .attr('x2', d => nodeById.get(d.target).x)
    .attr('y2', d => nodeById.get(d.target).y)
    .attr('stroke', d => edgeColorScale(d.edge_occurence) || '#999')
    .attr('stroke-width', d => edgeWidthScale(d.edge_occurence) || 1)
    .attr('stroke-dasharray', d => d['edge_occurence'] === 0.0 ? '6 3' : '0')
    .attr('marker-end', 'url(#arrowhead)')
    .on("mouseover", (event, d) => {
      tooltip.transition().duration(200).style("opacity", 0.9);
      tooltip.html("Edge Occurrence: " + d.edge_occurence)
        .style("left", (event.pageX + 5) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", (event, d) => {
      tooltip.transition().duration(500).style("opacity", 0);
    });
  }



// Function to add legends to the graph
function addLegends(svgWidth) {
  const GAP   = 10;                      // 20 px gap
  const xPos  = svgWidth - PAD_R + GAP;  // PAD_R is your inner right padding
  const yPos  = 20;                      // 20 px from top of SVG

  const colorLegend = svg.append("g")
    .attr("class", "color-legend")
    .attr("transform", `translate(${xPos}, ${yPos})`);

  colorLegend.append("text")
    .attr("font-size", 14)
    .attr("font-weight", "bold")
    .text("Node Color");

  const colorData = [
    { color: "#FFC0CB", label: "Present in MAG  E‑value < 1e‑5" },
    { color: "#1f77b4", label: "Present in MAG  E‑value > 1e‑5" },
    { color: "black",   label: "Absent in MAG" }
  ];

  // circles
  colorLegend.selectAll("circle")
    .data(colorData)
    .enter().append("circle")
      .attr("cx", 20)
      .attr("cy", (_, i) => 20 + i * 40)
      .attr("r",  9)
      .attr("fill", d => d.color)
      .attr("stroke", "black");

  // labels
  colorLegend.selectAll("text.color-label")
    .data(colorData)
    .enter().append("text")
      .attr("x", 40)
      .attr("y", (_, i) => 20 + i * 40)
      .attr("dy", "0.35em")
      .attr("font-size", 12)
      .text(d => d.label);
}

/**
 * Use dagre to run a Sugiyama (layered) layout on your node-link data.
 * This function mutates the `nodes` array to add x,y. 
 * @param {Array} nodes - Each node must have a unique `id`.
 * @param {Array} links - Each link must have `source` and `target` IDs.
 * @param {Number} nodeWidth  - Approximate width for each node (for layout calcs).
 * @param {Number} nodeHeight - Approximate height for each node (for layout calcs).
 */
function sugiyamaLayout(nodes, links, nodeWidth = 40, nodeHeight = 40) {
  // 1) Create a new directed graph
  const g = new dagre.graphlib.Graph({ multigraph: true })
    .setGraph({rankdir: 'TB',  // or 'TB', 'BT', 'RL'
      nodesep: 20,
      ranksep: 50})
    .setDefaultEdgeLabel(() => ({}));

  // 2) Add all nodes to the dagre graph
  nodes.forEach((node) => {
    g.setNode(node.id, { 
      width: nodeWidth, 
      height: nodeHeight 
    });
  });

  // 3) Add all edges (links) to the graph
  links.forEach((link) => {
    g.setEdge(link.source, link.target);
  });

  // 4) Run sugiyama (layered) layout
  dagre.layout(g);
  const gDims = g.graph();
  const { w: SVG_W, h: SVG_H } = getSvgDims(); 
  const xScale = d3.scaleLinear()
      .domain([0, gDims.width])
      .range([PAD_L, SVG_W - PAD_R]);
  const yScale = d3.scaleLinear()
      .domain([0, gDims.height])
      .range([PAD_T, SVG_H - PAD_B]);

  // 5) dagre.layout(g) assigns x,y coordinates to each node in g
  //    Transfer x,y back to our `nodes` array
  nodes.forEach(node => {
    const pos = g.node(node.id);
    node.x = xScale(pos.x);
    node.y = yScale(pos.y);
  });

  d3.select("#graph-container")
  .select("svg")
  .attr("width",  SVG_W)
  .attr("height", SVG_H);

  // 6) Return new arrays or just rely on the mutated `nodes`
  return { nodes, links };
}

// Function to find all paths passing through the node
function findPaths(nodeId) {
  const incoming = currentLinks.filter(l => l.target === nodeId);
  const outgoing = currentLinks.filter(l => l.source === nodeId);
  const paths = [];

  incoming.forEach(l => paths.push([l.source, nodeId]));
  outgoing.forEach(l => paths.push([nodeId, l.target]));
  return paths;
}

// Function to highlight paths passing through the selected node
function highlightPaths(nodeId) {
  const paths = findPaths(nodeId);
  highlightedNodes.clear();  // Clear previously highlighted nodes and links
  highlightedLinks.clear();  // Clear previously highlighted links

  // For each path, highlight the nodes and edges
  paths.forEach(path => {
    path.forEach(node => {
      highlightedNodes.add(node);
    });
    
    // Find edges connecting the nodes in the path
    for (let i = 0; i < path.length - 1; i++) {
      const edge = findEdgeBetween(path[i], path[i + 1]);
      if (edge) {
        highlightedLinks.add(edge);
      }
    }
  });

  // Update node and edge styles based on highlights
  nodeGroup.selectAll("circle")
    .attr("fill", d => highlightedNodes.has(d.id) ? "orange" : d.fill);

  linkGroup.selectAll("line.link")
    .attr("stroke", d => highlightedLinks.has(d) ? "orange" : d.stroke);
}

// Function to find edges between two nodes
function findEdgeBetween(a, b) {        // use currentLinks
    return currentLinks.find(l =>
       (l.source === a && l.target === b) ||
       (l.source === b && l.target === a)
     );
  }

  function updateSelectionStyling() {
    nodeGroup.selectAll("circle")
      .attr("stroke", function (d) {
          if (selected.has(d.id)) return "dodgerblue";
          return d.baseStroke;
      })
      .attr("stroke-width", function (d) {
          if (selected.has(d.id)) return 4;
          return d.baseStrokeW;
      });
  }
  

  function clearHighlight() {
    highlightedNodes.clear();
    highlightedLinks.clear();
  
    nodeGroup.selectAll("circle")
      .attr("stroke",       d => d.baseStroke)
      .attr("stroke-width", d => d.baseStrokeW);
  
    linkGroup.selectAll("line.link")
      .attr("stroke", d => d.baseColor)
      .attr("stroke-width", 1);
  }
  
  
  /**
 *  getAllPathsThroughSelected
 *  ------------------------------------------
 *  @param {Set<string>} required  – IDs of nodes that must appear
 *  @return {Array<Array<string>>} – every START → SINK path that
 *                                   contains *all* required nodes
 *
 *  Works for a DAG.  If the graph might contain cycles, add a
 *  `visited` set to cut them.
 */
function getAllPathsThroughSelected(required) {
  const results = [];

  // build adjacency list once
  const next = new Map();
  currentLinks.forEach(l => {
    if (!next.has(l.source)) next.set(l.source, []);
    next.get(l.source).push(l.target);
  });

  // depth‑first enumeration
  function dfs(node, path, stillNeeded) {
    const newNeeded = new Set(stillNeeded);
    newNeeded.delete(node);               // mark as met if required

    if (node === "SINK") {
      if (newNeeded.size === 0) results.push([...path]);
      return;
    }
    if (!next.has(node)) return;          // dead end

    for (const nbr of next.get(node)) {
      path.push(nbr);
      dfs(nbr, path, newNeeded);
      path.pop();
    }
  }

  dfs("START", ["START"], new Set(required));
  return results;
}


function highlightAllSelectedPaths() {
  clearHighlight();                 // start clean
  if (selected.size === 0) return;

  const paths = getAllPathsThroughSelected(selected);
  if (paths.length === 0) return;

  const nodeU = new Set();
  const edgeU = new Set();

  paths.forEach(p => {
    p.forEach(n => nodeU.add(n));
    for (let i = 0; i < p.length - 1; i++) {
      const e = findEdgeBetween(p[i], p[i + 1]);
      if (e) edgeU.add(e);
    }
  });

  // HALO for every node on *any* path
  nodeGroup.selectAll("circle")
    .attr("stroke",       d => nodeU.has(d.id) ? "orange" : d.baseStroke)
    .attr("stroke-width", d => nodeU.has(d.id) ? 4          : d.baseStrokeW);

  // Edges turn orange too
  linkGroup.selectAll("line.link")
    .attr("stroke", d => edgeU.has(d) ? "orange" : d.baseColor)
    .attr("stroke-width", d => edgeU.has(d) ? 3  : 1);
}

window.addEventListener("resize", () => {
  if (currentNodes.length) renderGraph(currentNodes, currentLinks);
});
