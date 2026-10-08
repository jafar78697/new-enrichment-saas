import re

with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

sched_old = """    // Traverse backwards from this outcome node to verify date/time collection exists on ALL reachable incoming paths
    const adjReverse = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjReverse.has(edge.target)) adjReverse.set(edge.target, []);
      adjReverse.get(edge.target)!.push(edge.source);
    }

    let allPathsCollect = true;
    const memo = new Map<string, boolean>();

    const checkAllPathsHaveCollection = (currId: string, visited: Set<string>): boolean => {
      if (memo.has(currId)) return memo.get(currId)!;
      
      const curr = nodeMap.get(currId);
      if (curr) {
        if (curr.type === 'followup') {
          memo.set(currId, true);
          return true;
        }
        if (curr.type === 'meeting_cta' && (curr.data?.collectDate && curr.data?.collectTime)) {
          memo.set(currId, true);
          return true;
        }
        if (curr.type === 'start' || curr.type === 'opening') {
          // Hit the start without finding a collector
          memo.set(currId, false);
          return false;
        }
      }
      
      const preds = adjReverse.get(currId) || [];
      if (preds.length === 0) {
        memo.set(currId, false);
        return false; // Dead end backwards without a collector
      }

      visited.add(currId);
      let allIncomingCollect = true;
      for (const pred of preds) {
        if (visited.has(pred)) continue; // avoid cycles in check
        const pathCollects = checkAllPathsHaveCollection(pred, new Set(visited));
        if (!pathCollects) {
          allIncomingCollect = false;
          break;
        }
      }
      
      memo.set(currId, allIncomingCollect);
      return allIncomingCollect;
    };

    allPathsCollect = checkAllPathsHaveCollection(outcomeNode.id, new Set<string>());"""

sched_new = """    // Traverse backwards from this outcome node to verify date/time collection exists on ALL reachable incoming paths
    const adjReverseEdges = new Map<string, Edge[]>();
    for (const edge of edges) {
      if (!adjReverseEdges.has(edge.target)) adjReverseEdges.set(edge.target, []);
      adjReverseEdges.get(edge.target)!.push(edge);
    }

    let allPathsCollect = true;
    const memo = new Map<string, boolean>();

    const checkAllPathsHaveCollection = (currId: string, visited: Set<string>, incomingEdge?: Edge): boolean => {
      const memoKey = currId + (incomingEdge ? '-' + incomingEdge.id : '');
      if (memo.has(memoKey)) return memo.get(memoKey)!;
      
      const curr = nodeMap.get(currId);
      if (curr) {
        let isCollector = false;
        if (curr.type === 'followup') isCollector = true;
        if (curr.type === 'meeting_cta' && (curr.data?.collectDate && curr.data?.collectTime)) isCollector = true;
        
        if (isCollector) {
          if (incomingEdge) {
            const semantic = getHandleSemantic(curr.type, incomingEdge.sourceHandle);
            if (semantic === 'negative' || semantic === 'refusal' || incomingEdge.sourceHandle === 'declined') {
               // A declined edge from a collector does NOT carry the collected date/time.
               isCollector = false;
            }
          }
          if (isCollector) {
            memo.set(memoKey, true);
            return true;
          }
        }
        
        if (curr.type === 'start' || curr.type === 'opening') {
          // Hit the start without finding a collector
          memo.set(memoKey, false);
          return false;
        }
      }
      
      const predEdges = adjReverseEdges.get(currId) || [];
      if (predEdges.length === 0) {
        memo.set(memoKey, false);
        return false; // Dead end backwards without a collector
      }

      visited.add(currId);
      let allIncomingCollect = true;
      for (const predEdge of predEdges) {
        if (visited.has(predEdge.source)) continue; // avoid cycles in check
        const pathCollects = checkAllPathsHaveCollection(predEdge.source, new Set(visited), predEdge);
        if (!pathCollects) {
          allIncomingCollect = false;
          break;
        }
      }
      
      memo.set(memoKey, allIncomingCollect);
      return allIncomingCollect;
    };

    allPathsCollect = checkAllPathsHaveCollection(outcomeNode.id, new Set<string>());"""

content = content.replace(sched_old, sched_new)

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)

print("Scheduling logic patched for negative edges")
