const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logFile1 = '/home/jafar-tayyar-siddiqi/.gemini/antigravity-ide/brain/79f77663-dddf-46b9-9b19-b8e18790799d/.system_generated/logs/transcript_full.jsonl';
const logFile2 = '/home/jafar-tayyar-siddiqi/.gemini/antigravity-ide/brain/21f207a6-d8e7-44dc-90d6-039fa2154d8f/.system_generated/logs/transcript_full.jsonl';

const files = {};

function getFileContent(filePath) {
   if (files[filePath]) return files[filePath];
   const relativePath = filePath.replace('/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/', '');
   try {
      const content = fs.readFileSync(relativePath, 'utf8');
      files[filePath] = content;
      return content;
   } catch (e) {
      return null;
   }
}

async function processLogFile(logFile) {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'PLANNER_RESPONSE' && parsed.tool_calls) {
        for (const call of parsed.tool_calls) {
          if (call.name === 'write_to_file' || call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
            const args = call.args;
            if (args.TargetFile && !args.TargetFile.includes('.gemini') && args.TargetFile.includes('enrichment-saas')) {
               let currentContent = getFileContent(args.TargetFile) || "";
               
               if (call.name === 'write_to_file') {
                  files[args.TargetFile] = args.CodeContent;
               } else if (call.name === 'replace_file_content') {
                  files[args.TargetFile] = currentContent.replace(args.TargetContent, args.ReplacementContent);
               } else if (call.name === 'multi_replace_file_content') {
                  const chunks = typeof args.ReplacementChunks === 'string' ? JSON.parse(args.ReplacementChunks) : args.ReplacementChunks;
                  for (const chunk of chunks) {
                     currentContent = currentContent.replace(chunk.TargetContent, chunk.ReplacementContent);
                  }
                  files[args.TargetFile] = currentContent;
               }
            }
          }
        }
      }
    } catch (e) {}
  }
}

async function run() {
  await processLogFile(logFile1);
  await processLogFile(logFile2);
  
  for (const [filePath, content] of Object.entries(files)) {
     if (filePath.includes('.env.example') || filePath.includes('.env.production') || filePath.includes('.env')) continue;
     const relativePath = filePath.replace('/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/', '');
     console.log("Writing " + relativePath);
     fs.mkdirSync(path.dirname(relativePath), { recursive: true });
     fs.writeFileSync(relativePath, content);
  }
}
run();
