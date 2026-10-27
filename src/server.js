import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PORT } from './config.js';
import { createApp } from './http/app.js';

export function startServer(port = PORT) {
  const server = createApp();
  server.listen(port, () => {
    const address = server.address();
    console.log(`Event ticketing server listening on port ${address.port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer();
}
