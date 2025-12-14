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
exports.getGitInfo = getGitInfo;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
async function getGitInfo() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder)
        return {};
    const cwd = folder.uri.fsPath;
    const [remote, ref] = await Promise.all([
        execGit(cwd, ["config", "--get", "remote.origin.url"]),
        execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    ]);
    return {
        repositoryUrl: normalizeGitRemoteToHttps(remote?.trim() || ""),
        ref: ref?.trim() || "",
    };
}
function execGit(cwd, args) {
    return new Promise((resolve) => {
        (0, node_child_process_1.execFile)("git", args, { cwd }, (err, stdout) => {
            if (err)
                return resolve(undefined);
            resolve(String(stdout ?? ""));
        });
    });
}
function normalizeGitRemoteToHttps(remote) {
    if (!remote)
        return undefined;
    // Already https
    if (remote.startsWith("https://"))
        return remote.replace(/\.git$/, "");
    // git@github.com:org/repo.git
    const ssh = remote.match(/^git@([^:]+):(.+?)(\.git)?$/);
    if (ssh) {
        return `https://${ssh[1]}/${ssh[2]}`.replace(/\.git$/, "");
    }
    // ssh://git@github.com/org/repo.git
    const ssh2 = remote.match(/^ssh:\/\/git@([^/]+)\/(.+?)(\.git)?$/);
    if (ssh2) {
        return `https://${ssh2[1]}/${ssh2[2]}`.replace(/\.git$/, "");
    }
    // Fallback: return as-is
    return remote.replace(/\.git$/, "");
}
