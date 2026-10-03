import { loadConfig } from './config.js';
import { startServer } from './server.js';

const config = loadConfig();
const { servers, state, customCount, close } = await startServer(config);

servers.forEach((s, i) => {
  console.log(`Boddle Revival listening on ${i === 0 ? 'http' : 'https'}://localhost:${s.address().port}`);
});
console.log(`  ${state.captures.size} recorded responses, ${customCount} custom handlers`);
console.log(`  Play:  http://localhost:${config.port}/play`);
console.log(`  Admin: http://localhost:${config.port}/admin`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await close();
    process.exit(0);
  });
}
