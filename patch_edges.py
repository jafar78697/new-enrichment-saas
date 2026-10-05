import re

# Patch script-validator.ts
with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

import_old = """import {
  ALLOWED_TEMPLATE_VARS,
  TEMPLATE_VAR_REGEX,
  isDeclaredHandle,
  getHandleSemantic,
  extractTemplateVars
} from './template-registry.js';"""
import_new = """import {
  ALLOWED_TEMPLATE_VARS,
  TEMPLATE_VAR_REGEX,
  isDeclaredHandle,
  getHandleSemantic,
  extractTemplateVars,
  normalizeHandle
} from './template-registry.js';"""

content = content.replace(import_old, import_new)

edges_old = """  const nodes = script.nodes || [];
  const edges = script.edges || [];"""
edges_new = """  const nodes = script.nodes || [];
  // Normalize edges immediately
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const edges = (script.edges || []).map(e => ({
    ...e,
    sourceHandle: normalizeHandle(nodeTypeMap.get(e.source) || 'node', e.sourceHandle)
  }));"""

content = content.replace(edges_old, edges_new)

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)


# Patch script-compiler.ts
with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

import_old2 = """import { getHandleLabel } from './template-registry.js';"""
import_new2 = """import { getHandleLabel, normalizeHandle } from './template-registry.js';"""
content = content.replace(import_old2, import_new2)

edges_old2 = """  const edges = script.edges || [];"""
edges_new2 = """  // Normalize edges immediately
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const edges = (script.edges || []).map(e => ({
    ...e,
    sourceHandle: normalizeHandle(nodeTypeMap.get(e.source) || 'node', e.sourceHandle)
  }));"""
content = content.replace(edges_old2, edges_new2)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("Validator and Compiler edges normalized.")
