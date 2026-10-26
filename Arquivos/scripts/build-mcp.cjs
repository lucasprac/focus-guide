// Bundles the MCP server and its dependencies into one CommonJS file. The packaged app ships it in
// resources/mcp, and an AI client runs it with the app executable and ELECTRON_RUN_AS_NODE=1.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const { build } = await import('vite');
  await build({
    configFile: false, root, logLevel: 'warn',
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: path.join(root, 'src/mcp/server.ts'), outDir: path.join(root, 'out/mcp'), emptyOutDir: true, target: 'node20', minify: false, sourcemap: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'focus-guide-mcp.cjs', inlineDynamicImports: true } }
    }
  });
})().catch(error => { console.error(error); process.exit(1); });
