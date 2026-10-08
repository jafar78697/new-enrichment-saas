import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

bridge_old = """            try {
              const settings = buildDeepgramSettings(
                leadData,
                agentConfig,
                {
                  compiledScriptPrompt: session.compiled_script_prompt,
                  laneId: session.lane_id,
                  scriptVersionId: session.script_version_id
                }
              );
              deepgramWs.send(JSON.stringify(settings));
              settingsSent = true;
            } catch (err) {
              console.error('[deepgram-bridge] Failed to build or send settings:', err);
              // Report as a technical failure to avoid silent hangs
              fastify.db.query(
                `UPDATE ai_call_sessions SET call_state = 'failed', last_error = $1 WHERE id = $2`,
                [err.message || 'Failed to initialize settings', sessionId]
              ).catch(e => console.error('[deepgram-bridge] DB update failed for settings error', e));
              
              if (callSid) {
                const signalwire = fastify.signalwire;
                const swClient = signalwire(env.SIGNALWIRE_PROJECT_ID, env.SIGNALWIRE_API_TOKEN, {
                  signalwireSpaceUrl: env.SIGNALWIRE_SPACE_URL,
                });
                swClient.calls(callSid).update({ status: 'completed' })
                  .catch(e => console.error('[deepgram-bridge] Failed to hang up after init error:', e));
              }
              
              if (deepgramWs.readyState === WebSocket.OPEN) {
                deepgramWs.close();
              }
              return;
            }
            const listenProvider = settings.agent?.listen?.provider || {};
            const speakProvider = settings.agent?.speak?.provider || {};
            console.log('[deepgram-bridge] Deepgram settings sent:', {
              callSid,
              sessionId,
              voice: speakProvider.model,
              speakSpeed: speakProvider.speed,
              listenModel: listenProvider.model,
              eotThreshold: listenProvider.eot_threshold,
              eotTimeoutMs: listenProvider.eot_timeout_ms,
            });"""

bridge_new = """            try {
              const settings = buildDeepgramSettings(
                leadData,
                agentConfig,
                {
                  compiledScriptPrompt: session.compiled_script_prompt,
                  laneId: session.lane_id,
                  scriptVersionId: session.script_version_id
                }
              );
              deepgramWs.send(JSON.stringify(settings));
              settingsSent = true;
              
              const listenProvider = settings.agent?.listen?.provider || {};
              const speakProvider = settings.agent?.speak?.provider || {};
              console.log('[deepgram-bridge] Deepgram settings sent:', {
                callSid,
                sessionId,
                voice: speakProvider.model,
                speakSpeed: speakProvider.speed,
                listenModel: listenProvider.model,
                eotThreshold: listenProvider.eot_threshold,
                eotTimeoutMs: listenProvider.eot_timeout_ms,
              });
            } catch (err) {
              console.error('[deepgram-bridge] Failed to build or send settings:', err);
              // Report as a technical failure to avoid silent hangs
              query(
                `UPDATE ai_call_sessions SET call_state = 'failed', ended_at = NOW(), hangup_reason = 'technical_failure', last_error = $1 WHERE id = $2`,
                [err.message || 'Failed to initialize settings', sessionId]
              ).catch(e => console.error('[deepgram-bridge] DB update failed for settings error', e));
              
              if (callSid) {
                const swClient = RestClient(env.SIGNALWIRE_PROJECT_ID, env.SIGNALWIRE_API_TOKEN, {
                  signalwireSpaceUrl: env.SIGNALWIRE_SPACE_URL,
                });
                swClient.calls(callSid).update({ status: 'completed' })
                  .catch(e => console.error('[deepgram-bridge] Failed to hang up after init error:', e));
              }
              
              if (deepgramWs.readyState === WebSocket.OPEN) {
                deepgramWs.close();
              }
              return;
            }"""

if bridge_old in content:
    content = content.replace(bridge_old, bridge_new)
else:
    print("WARNING: Old bridge chunk not found!")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(content)

print("Settings initialization patched for scopes and error handling.")
