import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

send_old = """            } catch (err) {
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
            }
          };

          // Deepgram expects Settings as soon as its WebSocket is ready. Waiting
          // only for a Welcome event can leave a live phone call with no greeting.
          deepgramWs.on('open', () => {
            console.log('[deepgram-bridge] Deepgram WebSocket connected:', { callSid, sessionId });
            sendSettings();
            keepAliveTimer = setInterval(() => {
              if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
            }, 15000);
          });"""

send_new = """            } catch (err) {
              console.error('[deepgram-bridge] Failed to build or send settings:', err);
              closePhoneCall({ 
                callSid, 
                signalWireWs, 
                sessionId, 
                reason: 'bridge-error',
                lastError: err.message || 'Failed to initialize settings'
              }).catch(() => null);
              
              if (deepgramWs.readyState === WebSocket.OPEN) {
                deepgramWs.close();
              }
              return false;
            }
            return true;
          };

          // Deepgram expects Settings as soon as its WebSocket is ready. Waiting
          // only for a Welcome event can leave a live phone call with no greeting.
          deepgramWs.on('open', () => {
            console.log('[deepgram-bridge] Deepgram WebSocket connected:', { callSid, sessionId });
            const ok = sendSettings();
            if (ok) {
              keepAliveTimer = setInterval(() => {
                if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
              }, 15000);
            }
          });"""

content = content.replace(send_old, send_new)

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(content)

print("sendSettings cleanup patched")
