const fs = require('fs');
const readline = require('readline');
const logFile = '/home/jafar-tayyar-siddiqi/.gemini/antigravity-ide/brain/21f207a6-d8e7-44dc-90d6-039fa2154d8f/.system_generated/logs/transcript_full.jsonl';

async function processLineByLine() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  for await (const line of rl) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'PLANNER_RESPONSE' && parsed.tool_calls) {
        for (const call of parsed.tool_calls) {
          if (call.name === 'write_to_file') {
             if (call.args.TargetFile.includes('deepgram-signalwire-bridge.js') || 
                 call.args.TargetFile.includes('first-answer-detector.js') ||
                 call.args.TargetFile.includes('ai-call-session.service.js') ||
                 call.args.TargetFile.includes('deepgram-realtime.service.js') ||
                 call.args.TargetFile.includes('google-gatekeeper-engine.js') ||
                 call.args.TargetFile.includes('cheap-engine.js')
                ) {
                console.log("Writing " + call.args.TargetFile);
                fs.writeFileSync(call.args.TargetFile, call.args.CodeContent);
             }
          }
        }
      }
    } catch (e) {}
  }
}
processLineByLine();
