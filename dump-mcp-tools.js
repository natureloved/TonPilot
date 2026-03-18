const { spawn } = require('child_process');

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const mcp = spawn(npxCmd, ['-y', '@ton/mcp@alpha'], { stdio: ['pipe', 'pipe', 'inherit'] });

const req1 = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" }
  }
});

mcp.stdout.on('data', data => {
  const responses = data.toString().split('\n').filter(Boolean);
  for (const line of responses) {
    try {
      const parsed = JSON.parse(line);
      console.log("RECV:", JSON.stringify(parsed, null, 2));
      if (parsed.id === 1) {
        mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + '\n');
        mcp.stdin.write(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        }) + '\n');
      } else if (parsed.id === 2) {
        console.log("TOOLS LIST:");
        console.log(JSON.stringify(parsed.result, null, 2));
        process.exit(0);
      }
    } catch(e) { }
  }
});

mcp.stdin.write(req1 + '\n');
