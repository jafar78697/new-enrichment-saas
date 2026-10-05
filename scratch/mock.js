const edges = [];
// Mock code just for testing the logic
const validate = () => {
    // Traverse backwards from this outcome node to verify date/time collection exists on all reachable incoming paths
    
    // Instead of BFS for ANY path, we do a DFS that checks if ALL paths from start to this node have a collector.
    // Actually, simpler: From the outcome node, search backwards. 
    // A path is valid if it hits a collector.
    // If a path hits the START node without hitting a collector, then there is a path without collection.
    // We can do this with a recursive DFS backwards.
};
