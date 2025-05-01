// fileProcessing.js

// We'll use a Promise-based function that reads a CSV string and returns
// a Map (or object) of { KOName: EValue } pairs.

export async function parseCSV(text) {
    // Split into lines
    const lines = text.split(/\r?\n/);
    
    // The first line should be the header: e.g. "KO,E-value,OtherColumn,..."
    // We'll figure out which indices correspond to "KO" and "E-value".
    const header = lines[0].split(",");
    const koIndex = header.indexOf("KO");
    const eValueIndex = header.indexOf("E-value");
  
    // If the columns aren't found, throw an error
    if (koIndex === -1 || eValueIndex === -1) {
      throw new Error("CSV missing 'KO' or 'E-value' column in the header.");
    }
  
    // Create a Map to store the KO -> E-value
    const koMap = new Map();
  
    // Iterate over each subsequent line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip empty lines
      if (!line) continue;
  
      const cols = line.split(",");
      // Basic safety check
      if (cols.length <= Math.max(koIndex, eValueIndex)) continue;
  
      const koName = cols[koIndex].trim();
      const eValStr = cols[eValueIndex].trim();
      const eVal = parseFloat(eValStr);
  
      // If KO or E-value invalid, skip
      if (!koName || isNaN(eVal)) continue;
  
      // Store in our Map
      koMap.set(koName, eVal);
    }
  
    return koMap;
  }
  
  /**
   * Utility to strip underscore from node ID.
   * E.g. "K00001_42" -> "K00001"
   * If your node is e.g. "K00001_42_foo", adapt accordingly.
   */
  export function stripNodeID(nodeID) {
    // This finds the first underscore, if any, and takes everything before it
    const underscoreIndex = nodeID.indexOf("_");
    if (underscoreIndex !== -1) {
      return nodeID.substring(0, underscoreIndex);
    }
    return nodeID; // no underscore, return as is
  }
  