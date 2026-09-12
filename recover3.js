const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logFile = '/home/jafar-tayyar-siddiqi/.gemini/antigravity-ide/brain/79f77663-dddf-46b9-9b19-b8e18790799d/.system_generated/logs/transcript_full.jsonl';

async function processLineByLine() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const files = {};

  for await (const line of rl) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'PLANNER_RESPONSE' && parsed.tool_calls) {
        for (const call of parsed.tool_calls) {
          if (call.name === 'write_to_file' || call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
            const args = call.args;
            if (args.TargetFile && !args.TargetFile.includes('.gemini')) {
               console.log("Found modification for: " + args.TargetFile);
               if (call.name === 'write_to_file') {
                  files[args.TargetFile] = args.CodeContent;
               } else if (call.name === 'replace_file_content') {
                  if (files[args.TargetFile]) {
                     files[args.TargetFile] = files[args.TargetFile].replace(args.TargetContent, args.ReplacementContent);
                  }
               } else if (call.name === 'multi_replace_file_content') {
                  if (files[args.TargetFile]) {
                     const chunks = typeof args.ReplacementChunks === 'string' ? JSON.parse(args.ReplacementChunks) : args.ReplacementChunks;
                     for (const chunk of chunks) {
                        files[args.TargetFile] = files[args.TargetFile].replace(chunk.TargetContent, chunk.ReplacementContent);
                     }
                  }
               }
            }
          }
        }
      }
    } catch (e) {}
  }

  for (const [filePath, content] of Object.entries(files)) {
     const relativePath = filePath.replace('/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/', '');
     console.log("Writing to " + relativePath);
     fs.mkdirSync(path.dirname(relativePath), { recursive: true });
     fs.writeFileSync(relativePath, content);
  }
}

processLineByLine();
