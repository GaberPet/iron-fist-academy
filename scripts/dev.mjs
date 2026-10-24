// Dev runner: starts Vite, then Electron pointed at the dev server.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Vite dev server at ${url}`);
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, IFA_DEV_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
