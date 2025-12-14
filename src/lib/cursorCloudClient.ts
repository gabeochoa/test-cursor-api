export type CloudAgentStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "FAILED"
  | "STOPPING"
  | "STOPPED";

export type CloudAgentMessage = {
  id: string;
  type: "user_message" | "assistant_message";
  text: string;
};

export type CloudAgentConversation = {
  id: string;
  messages: CloudAgentMessage[];
};

export type CloudAgentCreateRequest = {
  prompt: { text: string };
  source: { repository: string; ref?: string };
  target?: {
    autoCreatePr?: boolean;
    openAsCursorGithubApp?: boolean;
    skipReviewerRequest?: boolean;
    branchName?: string;
  };
  model?: string;
};

export type CloudAgentCreateResponse = {
  id: string;
  name?: string;
  status?: CloudAgentStatus;
  createdAt?: string;
  target?: { url?: string; branchName?: string; prUrl?: string };
};

export type CloudAgentStatusResponse = {
  id: string;
  name?: string;
  status: CloudAgentStatus;
  summary?: string;
  createdAt?: string;
  source?: { repository: string; ref?: string };
  target?: {
    url?: string;
    prUrl?: string;
    branchName?: string;
    autoCreatePr?: boolean;
    openAsCursorGithubApp?: boolean;
    skipReviewerRequest?: boolean;
  };
};

export class CursorCloudClient {
  private apiBaseUrl: string;
  private apiKey: string;

  constructor(opts: { apiBaseUrl: string; apiKey: string }) {
    this.apiBaseUrl = opts.apiBaseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
  }

  async createAgent(req: CloudAgentCreateRequest): Promise<CloudAgentCreateResponse> {
    return await this.requestJson("POST", "/v0/agents", req);
  }

  async getAgentStatus(id: string): Promise<CloudAgentStatusResponse> {
    return await this.requestJson("GET", `/v0/agents/${encodeURIComponent(id)}`);
  }

  async getConversation(id: string): Promise<CloudAgentConversation> {
    return await this.requestJson("GET", `/v0/agents/${encodeURIComponent(id)}/conversation`);
  }

  async followup(id: string, text: string): Promise<{ id: string }> {
    return await this.requestJson("POST", `/v0/agents/${encodeURIComponent(id)}/followup`, {
      prompt: { text },
    });
  }

  async stop(id: string): Promise<{ id: string }> {
    return await this.requestJson("POST", `/v0/agents/${encodeURIComponent(id)}/stop`, {});
  }

  private async requestJson(method: string, path: string, body?: unknown): Promise<any> {
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

