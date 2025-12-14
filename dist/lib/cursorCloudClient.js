"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorCloudClient = void 0;
class CursorCloudClient {
    apiBaseUrl;
    apiKey;
    constructor(opts) {
        this.apiBaseUrl = opts.apiBaseUrl.replace(/\/+$/, "");
        this.apiKey = opts.apiKey;
    }
    async createAgent(req) {
        return await this.requestJson("POST", "/v0/agents", req);
    }
    async getAgentStatus(id) {
        return await this.requestJson("GET", `/v0/agents/${encodeURIComponent(id)}`);
    }
    async getConversation(id) {
        return await this.requestJson("GET", `/v0/agents/${encodeURIComponent(id)}/conversation`);
    }
    async followup(id, text) {
        return await this.requestJson("POST", `/v0/agents/${encodeURIComponent(id)}/followup`, {
            prompt: { text },
        });
    }
    async stop(id) {
        return await this.requestJson("POST", `/v0/agents/${encodeURIComponent(id)}/stop`, {});
    }
    async requestJson(method, path, body) {
        const url = `${this.apiBaseUrl}${path}`;
        const auth = Buffer.from(`${this.apiKey}:`, "utf8").toString("base64");
        const res = await fetch(url, {
            method,
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`Cursor API ${method} ${path} failed (${res.status}): ${text}`);
        }
        return text ? JSON.parse(text) : {};
    }
}
exports.CursorCloudClient = CursorCloudClient;
