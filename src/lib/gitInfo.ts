import * as vscode from "vscode";
import { execFile } from "node:child_process";

export type GitInfo = {
  repositoryUrl?: string;
  ref?: string;
};

export async function getGitInfo(): Promise<GitInfo> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return {};

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

function execGit(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (err, stdout) => {
      if (err) return resolve(undefined);
      resolve(String(stdout ?? ""));
    });
  });
}

function normalizeGitRemoteToHttps(remote: string): string | undefined {
  if (!remote) return undefined;
  // Already https
  if (remote.startsWith("https://")) return remote.replace(/\.git$/, "");

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

