# IDA Pro MCP Gateway

這個 repo 是用 Gemini-3-pro 產出的

身為一名(不專業的)逆向工程研究員，總是會同時開好幾個 IDA 視窗並且與 AI 合作逆向分析

但 [ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp) 的設計因為多開造成 port 衝突時

port number 會自動變更，要手動修改 MCP Settings 太麻煩了，所以就寫一個 MCP Gateway 讓 AI 可以一次處理所有 IDA instance

## Requirements

- [ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp)
- Node.JS

## Installation

1. git clone this repo and cd.
2. `npm install`
3. Configure your mcp settings according to the AI agent you are using.

### Example

- Gemini-cli

```json
{
  "mcpServers": {
	"ida-pro-mcp-gateway": {
		"command": "node",
		"args": [
			"<Path-to-ida-mcp-gateway-repo>\\gateway.js"
		]
	}
  }
}
```

```
User: 幫我看看目前 IDA 的連接狀況
AI: 我會先檢查目前已連接的 IDA 執行個體，並掃描本機連接埠以確認是否有可用的連接。
 ✓  gateway_list (ida-pro-mcp-gateway MCP Server) {}
 ✓  gateway_scan (ida-pro-mcp-gateway MCP Server) {}
 目前偵測到兩個 IDA 連接：
   1. patch-me.so (Port 13337): 目前作用中 (Active)。
   2. patch-me.so-13337 (Port 13337): 已偵測到但非目前作用中。
 您可以直接開始進行反組譯或分析工作。如果您想切換執行個體，可以使用 gateway_switch。
```