#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const EventSourceModule = require("eventsource");
const EventSource = EventSourceModule.EventSource || EventSourceModule;
const axios = require("axios");


const START_PORT = 13337;
const SCAN_RANGE = 10; // 13337-13346

let instances = new Map(); 
let activeInstanceId = null;

async function connectToInstance(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const sseUrl = `${baseUrl}/sse`;
  
  return new Promise((resolve, reject) => {

    const es = new EventSource(sseUrl);
    
    let sessionId = null;
    let isResolved = false;

    // Timeout safety
    const timeout = setTimeout(() => {
      if (!isResolved) {
        es.close();
        resolve(null); // Silent fail for scanning
      }
    }, 1000); // Quick timeout for scanning

    es.onmessage = (event) => {
    };

    es.addEventListener("endpoint", (event) => {
    });

    es.onopen = async () => {
      
      try {
        const postEndpoint = `${baseUrl}/mcp`;
        
        console.error(`[Gateway] Probing ${postEndpoint}...`);

        const response = await axios.post(postEndpoint, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        }, { timeout: 1000 });

        if (response.data && response.data.result) {
            const tools = response.data.result.tools || [];
            console.error(`[Gateway] Found instance at port ${port} with ${tools.length} tools.`);
            
            // Try to find a tool that looks like metadata to identify the instance
            // e.g. "idb_meta", "get_file_info", etc.
            let instanceId = `ida-${port}`;
            let metadata = { filename: `Unknown (Port ${port})` };

            // Heuristic: Call 'idb_meta' or similar if it exists
            const metaTool = tools.find(t => t.name.includes("meta") || t.name.includes("info"));
            if (metaTool) {
                try {
                    const metaRes = await axios.post(postEndpoint, {
                        jsonrpc: "2.0",
                        id: 2,
                        method: "tools/call",
                        params: { name: metaTool.name, arguments: {} }
                    });
                    if (metaRes.data.result && metaRes.data.result.content) {
                         // Try parsing JSON content first
                         try {
                            const content = JSON.parse(metaRes.data.result.content[0].text);
                            if (content.filename) {
                                instanceId = content.filename;
                                metadata = content;
                            } else if (content.path) {
                                instanceId = require('path').basename(content.path);
                            }
                         } catch (e) {
                             // If text is not JSON, just use a snippet as ID if short
                             const text = metaRes.data.result.content[0].text;
                             if (text.length < 50) instanceId = text.trim();
                         }
                    }
                } catch (e) { console.error(`[Gateway] Meta fetch failed for port ${port}: ${e.message}`); }
            }

            clearTimeout(timeout);
            isResolved = true;
            resolve({
                id: instanceId,
                port,
                url: baseUrl,
                endpoint: postEndpoint, // Store the correct endpoint
                tools,
                metadata,
                es // Keep connection open
            });
        } else {
            console.error(`[Gateway] Port ${port} responded but invalid format.`);
            es.close();
            clearTimeout(timeout);
            isResolved = true;
            resolve(null);
        }
      } catch (err) {
        console.error(`[Gateway] Port ${port} probe failed: ${err.message}`);
        es.close();
        clearTimeout(timeout);
        isResolved = true;
        resolve(null);
      }
    };

    es.onerror = (err) => {
      if (!isResolved) {
        clearTimeout(timeout);
        isResolved = true;
        es.close();
        resolve(null);
      }
    };
  });
}

async function scanInstances() {
    console.error(`[Gateway] Scanning ports ${START_PORT} to ${START_PORT + SCAN_RANGE - 1}...`);
    const promises = [];
    for (let i = 0; i < SCAN_RANGE; i++) {
        const port = START_PORT + i;
        // Skip if already connected
        const existing = Array.from(instances.values()).find(inst => inst.port === port);
        if (existing) {
             // Check if still alive? For now assume yes.
             continue;
        }
        promises.push(connectToInstance(port));
    }

    const results = await Promise.all(promises);
    let newCount = 0;
    
    for (const res of results) {
        if (res) {
            // Handle duplicate IDs (e.g. two opened instances of same file? add port suffix)
            let finalId = res.id;
            if (instances.has(finalId)) {
                finalId = `${res.id}-${res.port}`;
            }
            res.id = finalId;
            
            instances.set(finalId, res);
            newCount++;
            
            // Auto-select first one
            if (!activeInstanceId) {
                activeInstanceId = finalId;
            }
        }
    }
    console.error(`[Gateway] Scan complete. Found ${newCount} new instances. Total: ${instances.size}`);
}

// --- MCP Server ---

const server = new Server(
  { name: "ida-mcp-gateway", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (instances.size === 0) {
      await scanInstances();
  }

  const gatewayTools = [
    {
      name: "gateway_scan",
      description: "Scan local ports (13337+) for IDA instances.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "gateway_list",
      description: "List connected IDA instances.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "gateway_switch",
      description: "Switch active IDA instance.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Instance ID (usually filename)" }
        },
        required: ["id"]
      },
    },
  ];

  let instanceTools = [];
  if (activeInstanceId && instances.has(activeInstanceId)) {
      instanceTools = instances.get(activeInstanceId).tools;
  }

  return { tools: [...gatewayTools, ...instanceTools] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "gateway_scan") {
      await scanInstances();
      const list = Array.from(instances.values()).map(i => i.id);
      return { content: [{ type: "text", text: `Scan complete. Found: ${list.join(", ")}` }] };
  }

  if (name === "gateway_list") {
      const list = Array.from(instances.values()).map(i => ({
          id: i.id,
          port: i.port,
          metadata: i.metadata,
          active: i.id === activeInstanceId
      }));
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
  }

  if (name === "gateway_switch") {
      const target = args.id;
      if (instances.has(target)) {
          activeInstanceId = target;
          return { content: [{ type: "text", text: `Switched to ${target}` }] };
      }
      return { isError: true, content: [{ type: "text", text: "Instance not found" }] };
  }

  // Forwarding
  if (!activeInstanceId || !instances.has(activeInstanceId)) {
      return { isError: true, content: [{ type: "text", text: "No active instance. Run gateway_scan." }] };
  }

  const instance = instances.get(activeInstanceId);
  try {
      const targetEndpoint = instance.endpoint || `${instance.url}/mcp`;
      
      const response = await axios.post(targetEndpoint, {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name, arguments: args }
      });

      if (response.data && response.data.result) {
          return response.data.result;
      } else if (response.data.error) {
          return { isError: true, content: [{ type: "text", text: `IDA Error: ${JSON.stringify(response.data.error)}` }] };
      }
      return { isError: true, content: [{ type: "text", text: "Empty response from IDA" }] };

  } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Communication error: ${err.message}` }] };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("IDA MCP Gateway (SSE Scanner Mode) running...");
  // Initial scan
  scanInstances();
}

run().catch(console.error);