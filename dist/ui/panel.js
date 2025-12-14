"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BmadCloudPanel = void 0;
const vscode = __importStar(require("vscode"));
const gitInfo_1 = require("../lib/gitInfo");
class BmadCloudPanel {
    context;
    output;
    getClient;
    panel;
    workflows = [];
    state = { workflows: [] };
    pollTimer;
    lastMessageCount = 0;
    constructor(context, output, getClient) {
        this.context = context;
        this.output = output;
        this.getClient = getClient;
    }
    dispose() {
        this.stopPolling();
        this.panel?.dispose();
        this.panel = undefined;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside, true);
            return;
        }
        this.panel = vscode.window.createWebviewPanel("bmadCloud.panel", "BMAD Workflows (Cloud)", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => this.dispose());
        this.panel.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
        this.panel.webview.html = this.renderHtml(this.panel.webview);
        void this.bootstrapDefaults();
    }
    async setWorkflows(workflows) {
        this.workflows = workflows;
        this.state.workflows = workflows.map((w) => ({
            name: w.name,
            description: w.description,
            workflowMdPath: w.workflowMdPath,
        }));
        if (!this.state.selectedWorkflowName && workflows[0]) {
            this.state.selectedWorkflowName = workflows[0].name;
        }
        this.postState();
    }
    async runSelectedWorkflow() {
        await this.ensurePanel();
        await this.runWorkflowByName(this.state.selectedWorkflowName);
    }
    async promptAndSendFollowup() {
        await this.ensurePanel();
        if (!this.state.activeRunId) {
            void vscode.window.showWarningMessage("No active run.");
            return;
        }
        const text = await vscode.window.showInputBox({
            title: "BMAD Cloud Follow-up",
            prompt: "Send a message to the running agent (this is the only way to interact).",
            ignoreFocusOut: true,
        });
        if (!text)
            return;
        await this.sendFollowup(text);
    }
    async stopActiveRun() {
        await this.ensurePanel();
        const id = this.state.activeRunId;
        if (!id)
            return;
        const client = await this.getClient();
        this.output.info(`Stopping run ${id}...`);
        await client.stop(id);
        this.startPolling(id);
    }
    async ensurePanel() {
        if (!this.panel)
            this.show();
    }
    async bootstrapDefaults() {
        const git = await (0, gitInfo_1.getGitInfo)();
        if (!this.state.repoUrl)
            this.state.repoUrl = git.repositoryUrl;
        if (!this.state.ref)
            this.state.ref = git.ref;
        const cfg = vscode.workspace.getConfiguration("bmadCloud");
        this.state.model = String(cfg.get("model") ?? "");
        this.state.autoCreatePr = Boolean(cfg.get("autoCreatePr") ?? false);
        this.state.openAsCursorGithubApp = Boolean(cfg.get("openAsCursorGithubApp") ?? false);
        this.state.skipReviewerRequest = Boolean(cfg.get("skipReviewerRequest") ?? false);
        this.postState();
    }
    async onMessage(msg) {
        switch (msg?.type) {
            case "ui.ready": {
                this.postState();
                return;
            }
            case "ui.selectWorkflow": {
                this.state.selectedWorkflowName = String(msg.name || "");
                this.postState();
                return;
            }
            case "ui.updateConfig": {
                this.state.repoUrl = String(msg.repoUrl || "");
                this.state.ref = String(msg.ref || "");
                this.state.branchName = String(msg.branchName || "");
                this.state.contextFile = String(msg.contextFile || "");
                this.postState();
                return;
            }
            case "ui.run": {
                await this.runWorkflowByName(String(msg.name || ""));
                return;
            }
            case "ui.followup": {
                await this.sendFollowup(String(msg.text || ""));
                return;
            }
            case "ui.stop": {
                await this.stopActiveRun();
                return;
            }
            case "ui.openFile": {
                const p = String(msg.path || "");
                if (!p)
                    return;
                await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(p));
                return;
            }
        }
    }
    async runWorkflowByName(name) {
        if (!name)
            return;
        const wf = this.workflows.find((w) => w.name === name);
        if (!wf) {
            void vscode.window.showErrorMessage(`Workflow not found: ${name}`);
            return;
        }
        const repoUrl = (this.state.repoUrl || "").trim();
        if (!repoUrl) {
            void vscode.window.showErrorMessage("Repository URL is required (auto-filled from git remote if possible).");
            return;
        }
        const ref = (this.state.ref || "").trim() || undefined;
        const branchName = (this.state.branchName || "").trim() || undefined;
        const contextFile = (this.state.contextFile || "").trim();
        const cfg = vscode.workspace.getConfiguration("bmadCloud");
        const autoCreatePr = Boolean(cfg.get("autoCreatePr") ?? false);
        const openAsCursorGithubApp = Boolean(cfg.get("openAsCursorGithubApp") ?? false);
        const skipReviewerRequest = Boolean(cfg.get("skipReviewerRequest") ?? false);
        const model = String(cfg.get("model") ?? "").trim() || undefined;
        const prompt = this.buildPrompt({
            workflowMdPath: wf.workflowMdPath,
            workflowName: wf.name,
            description: wf.description,
            contextFile: contextFile || undefined,
        });
        const client = await this.getClient();
        this.output.info(`Launching cloud agent for workflow ${wf.name}...`);
        const created = await client.createAgent({
            prompt: { text: prompt },
            source: { repository: repoUrl, ref },
            model,
            target: {
                autoCreatePr,
                openAsCursorGithubApp,
                skipReviewerRequest,
                branchName,
            },
        });
        this.state.activeRunId = created.id;
        this.state.status = created.status ?? "CREATING";
        this.lastMessageCount = 0;
        this.postState();
        this.startPolling(created.id);
    }
    buildPrompt(opts) {
        const relHint = `_bmad/.../workflows/.../workflow.md`;
        return [
            `You are running inside Cursor Cloud Agents on this repository.`,
            ``,
            `Your task: execute the BMAD workflow **${opts.workflowName}**.`,
            `Description: ${opts.description || "(none)"}`,
            ``,
            `BMAD is installed in this repo (via \`npx bmad-method@alpha install\`).`,
            `Find and follow the workflow definition at:`,
            `- ${opts.workflowMdPath}`,
            ``,
            `Rules:`,
            `- Follow the workflow's own "MANDATORY EXECUTION RULES" / protocols exactly.`,
            `- Treat conversation messages as the only user interaction channel.`,
            `- When a workflow step says to read/write files, do so in the repo working tree.`,
            `- If the workflow references \`_bmad/core/config.yaml\`, load and use it.`,
            `- If the workflow uses placeholders like {project-root}, resolve them correctly for this repo.`,
            ``,
            opts.contextFile
                ? `Workflow invocation context: set \`context_file\` to "${opts.contextFile}" and use it if the workflow instructs.`
                : `No workflow invocation context file provided.`,
            ``,
            `Start by opening the workflow.md and executing its INITIALIZATION + first step instruction.`,
            `If the workflow is missing, explain what path you expected (e.g. ${relHint}) and stop.`,
        ].join("\n");
    }
    startPolling(id) {
        this.stopPolling();
        const cfg = vscode.workspace.getConfiguration("bmadCloud");
        const interval = Number(cfg.get("pollIntervalMs") ?? 2000);
        this.pollTimer = setInterval(() => void this.pollOnce(id), Math.max(500, interval));
        void this.pollOnce(id);
    }
    stopPolling() {
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        this.pollTimer = undefined;
    }
    async pollOnce(id) {
        try {
            const client = await this.getClient();
            const [status, convo] = await Promise.all([client.getAgentStatus(id), client.getConversation(id)]);
            this.applyStatus(status);
            this.applyConversation(convo);
            this.postState();
            if (status.status === "FINISHED" || status.status === "FAILED" || status.status === "STOPPED") {
                this.stopPolling();
            }
        }
        catch (err) {
            this.output.warn(`Polling error: ${String(err)}`);
        }
    }
    applyStatus(status) {
        this.state.status = status.status;
        this.state.summary = status.summary;
        this.state.prUrl = status.target?.prUrl;
        this.state.runUrl = status.target?.url;
    }
    applyConversation(convo) {
        this.state.conversation = { messages: convo.messages.map((m) => ({ ...m })) };
        if (convo.messages.length > this.lastMessageCount) {
            const newMsgs = convo.messages.slice(this.lastMessageCount);
            for (const m of newMsgs) {
                const prefix = m.type === "user_message" ? "You" : "Agent";
                this.output.info(`${prefix}: ${m.text}`);
            }
            this.lastMessageCount = convo.messages.length;
        }
    }
    async sendFollowup(text) {
        const id = this.state.activeRunId;
        if (!id)
            return;
        const msg = text.trim();
        if (!msg)
            return;
        const client = await this.getClient();
        await client.followup(id, msg);
        this.startPolling(id);
    }
    postState() {
        this.panel?.webview.postMessage({ type: "ext.state", state: this.state });
    }
    renderHtml(webview) {
        const nonce = getNonce();
        const csp = [
            `default-src 'none'`,
            `img-src ${webview.cspSource} https: data:`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
        ].join("; ");
        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>BMAD Cloud</title>
    <style>
      body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      label { display: flex; flex-direction: column; gap: 4px; min-width: 220px; }
      input, select, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px 8px; }
      textarea { width: 100%; min-height: 70px; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 8px 10px; cursor: pointer; }
      button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
      button:disabled { opacity: 0.55; cursor: default; }
      .card { border: 1px solid var(--vscode-editorWidget-border); border-radius: 8px; padding: 10px; margin-top: 10px; }
      .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
      .conv { white-space: pre-wrap; border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 8px; max-height: 45vh; overflow: auto; }
      .msg { padding: 6px 0; border-bottom: 1px solid rgba(127,127,127,0.2); }
      .msg:last-child { border-bottom: none; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); font-size: 12px; }
      .link { text-decoration: underline; cursor: pointer; }
      .mono { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="row">
      <div class="badge" id="statusBadge">status: —</div>
      <div class="muted mono" id="runId"></div>
      <div class="muted" id="runLinks"></div>
    </div>

    <div class="card">
      <div class="row">
        <label>
          Workflow
          <select id="workflowSelect"></select>
          <div class="muted" id="workflowDesc"></div>
        </label>
        <label>
          Repo URL (https)
          <input id="repoUrl" placeholder="https://github.com/org/repo" />
        </label>
        <label>
          Ref (branch/tag/sha)
          <input id="ref" placeholder="main" />
        </label>
        <label>
          Target branch (optional)
          <input id="branchName" placeholder="feature/bmad-run" />
        </label>
        <label>
          Context file path (optional)
          <input id="contextFile" placeholder="docs/context.md" />
        </label>
      </div>
      <div class="row">
        <button id="runBtn">Run workflow (cloud)</button>
        <button id="stopBtn" class="secondary" disabled>Stop</button>
      </div>
      <div class="muted">
        This runs entirely through Cursor Cloud Agents API (no local Cursor agent). Use Follow-up below to interact.
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content: space-between;">
        <div><strong>Conversation</strong></div>
        <div class="muted" id="summary"></div>
      </div>
      <div class="conv" id="conversation"></div>
      <div class="row">
        <textarea id="followupText" placeholder="Type a follow-up for the running workflow..."></textarea>
      </div>
      <div class="row">
        <button id="sendBtn" class="secondary" disabled>Send follow-up</button>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const els = {
        workflowSelect: document.getElementById('workflowSelect'),
        workflowDesc: document.getElementById('workflowDesc'),
        repoUrl: document.getElementById('repoUrl'),
        ref: document.getElementById('ref'),
        branchName: document.getElementById('branchName'),
        contextFile: document.getElementById('contextFile'),
        runBtn: document.getElementById('runBtn'),
        stopBtn: document.getElementById('stopBtn'),
        sendBtn: document.getElementById('sendBtn'),
        followupText: document.getElementById('followupText'),
        conversation: document.getElementById('conversation'),
        statusBadge: document.getElementById('statusBadge'),
        runId: document.getElementById('runId'),
        runLinks: document.getElementById('runLinks'),
        summary: document.getElementById('summary'),
      };

      let state = { workflows: [] };
      function setState(next) {
        state = next;

        // workflow select
        const current = els.workflowSelect.value;
        els.workflowSelect.innerHTML = '';
        for (const w of state.workflows || []) {
          const opt = document.createElement('option');
          opt.value = w.name;
          opt.textContent = w.name;
          els.workflowSelect.appendChild(opt);
        }
        els.workflowSelect.value = state.selectedWorkflowName || current || (state.workflows?.[0]?.name || '');
        const selected = (state.workflows || []).find(w => w.name === els.workflowSelect.value);
        els.workflowDesc.textContent = selected?.description || '';

        // config inputs
        if (state.repoUrl !== undefined) els.repoUrl.value = state.repoUrl;
        if (state.ref !== undefined) els.ref.value = state.ref;
        if (state.branchName !== undefined) els.branchName.value = state.branchName;
        if (state.contextFile !== undefined) els.contextFile.value = state.contextFile;

        const active = !!state.activeRunId;
        const status = state.status || '—';
        els.statusBadge.textContent = 'status: ' + status;
        els.runId.textContent = active ? ('run: ' + state.activeRunId) : '';

        const links = [];
        if (state.runUrl) links.push('<span class="link" data-url="' + state.runUrl + '">open run</span>');
        if (state.prUrl) links.push('<span class="link" data-url="' + state.prUrl + '">open PR</span>');
        els.runLinks.innerHTML = links.length ? (' • ' + links.join(' • ')) : '';
        for (const node of els.runLinks.querySelectorAll('[data-url]')) {
          node.addEventListener('click', () => window.open(node.getAttribute('data-url')));
        }

        els.summary.textContent = state.summary ? ('summary: ' + state.summary) : '';

        // conversation
        els.conversation.innerHTML = '';
        const msgs = state.conversation?.messages || [];
        for (const m of msgs) {
          const div = document.createElement('div');
          div.className = 'msg';
          const who = m.type === 'user_message' ? 'You' : 'Agent';
          div.innerHTML = '<div class="muted"><strong>' + who + '</strong></div>' +
                          '<div>' + escapeHtml(m.text || '') + '</div>';
          els.conversation.appendChild(div);
        }
        if (msgs.length) els.conversation.scrollTop = els.conversation.scrollHeight;

        const canInteract = active && (status === 'CREATING' || status === 'RUNNING');
        els.stopBtn.disabled = !canInteract;
        els.sendBtn.disabled = !canInteract;
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
      }

      function pushConfig() {
        vscode.postMessage({
          type: 'ui.updateConfig',
          repoUrl: els.repoUrl.value,
          ref: els.ref.value,
          branchName: els.branchName.value,
          contextFile: els.contextFile.value,
        });
      }

      els.workflowSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'ui.selectWorkflow', name: els.workflowSelect.value });
      });
      for (const el of [els.repoUrl, els.ref, els.branchName, els.contextFile]) {
        el.addEventListener('change', pushConfig);
        el.addEventListener('blur', pushConfig);
      }

      els.runBtn.addEventListener('click', () => {
        pushConfig();
        vscode.postMessage({ type: 'ui.run', name: els.workflowSelect.value });
      });
      els.stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'ui.stop' }));
      els.sendBtn.addEventListener('click', () => {
        const text = els.followupText.value.trim();
        if (!text) return;
        els.followupText.value = '';
        vscode.postMessage({ type: 'ui.followup', text });
      });

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg?.type === 'ext.state') setState(msg.state);
      });

      vscode.postMessage({ type: 'ui.ready' });
    </script>
  </body>
</html>`;
    }
}
exports.BmadCloudPanel = BmadCloudPanel;
function getNonce() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 32; i++)
        out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}
