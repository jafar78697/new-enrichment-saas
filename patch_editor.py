import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

editor_old = """                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                      {String(selectedNode.data.nodeType)} Script Content
                    </label>
                    <textarea 
                      className="w-full h-64 bg-gray-900 text-sm text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none font-mono"
                      value={(selectedNode.data.label || selectedNode.data.text || '') as string}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodes(nds => nds.map(n => {
                          if (n.id === selectedNode.id) {
                            return { ...n, data: { ...n.data, label: val, text: val } };
                          }
                          return n;
                        }));
                      }}
                      placeholder={`Enter the instructions or speech for this ${selectedNode.data.nodeType} step...`}
                    />
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                      Write what the AI should say or do at this point. Supported template variables: <code className="text-blue-400">&#123;&#123;first_name&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;company&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;phone&#125;&#125;</code>.
                    </p>
                  </div>"""

editor_new = """                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        Node Title
                      </label>
                      <input 
                        type="text"
                        className="w-full bg-gray-900 text-sm text-gray-100 p-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                        value={(selectedNode.data.label || '') as string}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(nds => nds.map(n => {
                            if (n.id === selectedNode.id) {
                              return { ...n, data: { ...n.data, label: val } };
                            }
                            return n;
                          }));
                        }}
                        placeholder={`Enter title for this ${selectedNode.data.nodeType} step...`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        {String(selectedNode.data.nodeType)} Script Content
                      </label>
                      <textarea 
                        className="w-full h-64 bg-gray-900 text-sm text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none font-mono"
                        value={(selectedNode.data.text || '') as string}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(nds => nds.map(n => {
                            if (n.id === selectedNode.id) {
                              return { ...n, data: { ...n.data, text: val } };
                            }
                            return n;
                          }));
                        }}
                        placeholder={`Enter the instructions or speech for this ${selectedNode.data.nodeType} step...`}
                      />
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                        Write what the AI should say or do at this point. Supported template variables: <code className="text-blue-400">&#123;&#123;first_name&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;company&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;phone&#125;&#125;</code>.
                      </p>
                    </div>
                  </div>"""

content = content.replace(editor_old, editor_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Editor logic patched")
