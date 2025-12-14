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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cursorCloudClient_1 = require("./lib/cursorCloudClient");
const workflowDiscovery_1 = require("./lib/workflowDiscovery");
const panel_1 = require("./ui/panel");
let panel;
async function activate(context) {
    const output = vscode.window.createOutputChannel("BMAD Cloud", { log: true });
    const setApiKeySecurely = async () => {
        const apiKey = await vscode.window.showInputBox({
            title: "Cursor Cloud Agents API Key",
            prompt: "Enter your Cursor Cloud Agents API key (stored securely).",
            password: true,
            ignoreFocusOut: true,
        });
        if (!apiKey)
            return;
        await context.secrets.store("bmadCloud.apiKey", apiKey);
        output.info("Stored API key in secure storage.");
    };
    const getClient = async () => {
        const cfg = vscode.workspace.getConfiguration("bmadCloud");
        const apiBaseUrl = String(cfg.get("apiBaseUrl") ?? "https://api.cursor.com");
        const configuredApiKey = String(cfg.get("apiKey") ?? "").trim();
        const storedApiKey = (await context.secrets.get("bmadCloud.apiKey"))?.trim();
        const apiKey = configuredApiKey || storedApiKey;
        if (!apiKey) {
            // Prompt as fallback, then store securely.
            const prompted = await vscode.window.showInputBox({
                title: "Cursor Cloud Agents API Key",
                prompt: "Enter your Cursor Cloud Agents API key (stored securely).",
                password: true,
                ignoreFocusOut: true,
            });
            if (!prompted)
                throw new Error("Missing API key.");
            await context.secrets.store("bmadCloud.apiKey", prompted);
            return new cursorCloudClient_1.CursorCloudClient({ apiBaseUrl, apiKey: prompted });
        }
        return new cursorCloudClient_1.CursorCloudClient({ apiBaseUrl, apiKey });
    };
    const openPanel = async () => {
        const workflows = await (0, workflowDiscovery_1.discoverBmadWorkflows)();
        panel ??= new panel_1.BmadCloudPanel(context, output, getClient);
        panel.show();
        await panel.setWorkflows(workflows);
    };
    context.subscriptions.push(vscode.commands.registerCommand("bmadCloud.openPanel", openPanel), vscode.commands.registerCommand("bmadCloud.setApiKey", setApiKeySecurely), vscode.commands.registerCommand("bmadCloud.runWorkflow", async () => {
        await openPanel();
        await panel?.runSelectedWorkflow();
    }), vscode.commands.registerCommand("bmadCloud.sendFollowup", async () => {
        await openPanel();
        await panel?.promptAndSendFollowup();
    }), vscode.commands.registerCommand("bmadCloud.stopRun", async () => {
        await openPanel();
        await panel?.stopActiveRun();
    }));
    // Auto-open panel once, but don't steal focus.
    setTimeout(() => {
        void openPanel().catch((err) => output.error(String(err)));
    }, 1500);
}
function deactivate() {
    panel?.dispose();
    panel = undefined;
}
