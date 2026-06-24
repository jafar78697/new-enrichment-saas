import { runOutboundCallerLoop } from './outbound-caller.js';

runOutboundCallerLoop().catch((err) => {
  console.error('[outbound-caller] Fatal startup error:', err);
  process.exit(1);
});
