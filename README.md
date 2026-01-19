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