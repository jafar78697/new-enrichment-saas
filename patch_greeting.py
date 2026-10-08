import re

with open('apps/api/src/voice-agent/providers/deepgram-agent.js', 'r') as f:
    content = f.read()

prompt_old = """  const prompt = compiledScriptPrompt 
    ? `${baseContent}${leadContext}${runtimeContext}${toolPolicy}`
    : `${baseContent}${nicheContext}${leadContext}${runtimeContext}${toolPolicy}${greetingInstruction}`;"""

prompt_new = """  const prompt = compiledScriptPrompt 
    ? `${baseContent}${leadContext}${runtimeContext}${toolPolicy}${greetingInstruction}`
    : `${baseContent}${nicheContext}${leadContext}${runtimeContext}${toolPolicy}${greetingInstruction}`;"""

content = content.replace(prompt_old, prompt_new)

with open('apps/api/src/voice-agent/providers/deepgram-agent.js', 'w') as f:
    f.write(content)

print("Added greetingInstruction to compiled script prompt in deepgram-agent.js")
