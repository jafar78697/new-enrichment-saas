import { SignalWire, StaticCredentialProvider } from '@signalwire/js';
async function test() {
  try {
    const cp = new StaticCredentialProvider({ token: "<html><body>Error fetching user information</body></html>" });
    const client = new SignalWire(cp);
    await client.connect();
  } catch (err) {
    console.error("CAUGHT:", err.message);
  }
}
test();
