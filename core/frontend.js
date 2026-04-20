// Embedded Next.js frontend launcher.
//
// The bot server spawns the Next.js app as a child process so users only
// need to run `npm start` at the repo root — no separate frontend terminal.
//
// Skipped when CHAT_API_URL points at a non-localhost host (the operator
// is using a remote/hosted frontend) or when BOT_EMBED_FRONTEND=0.

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const NEXT_BIN = path.join(FRONTEND_DIR, "node_modules", "next", "dist", "bin", "next");

function shouldSkip() {
  if (process.env.BOT_EMBED_FRONTEND === "0") return "BOT_EMBED_FRONTEND=0";
  const chatUrl = process.env.CHAT_API_URL;
  if (chatUrl) {
    try {
      const host = new URL(chatUrl).hostname;
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
      if (!isLocal) return `CHAT_API_URL points to remote host (${host})`;
    } catch {
      // malformed URL — fall through and try to start the embedded frontend anyway
    }
  }
  return null;
}

function start() {
  const skipReason = shouldSkip();
  if (skipReason) {
    console.log(`[frontend] embedded Next.js disabled — ${skipReason}.`);
    return null;
  }

  if (!fs.existsSync(NEXT_BIN)) {
    console.warn(
      "[frontend] frontend/node_modules not installed. " +
        "Run `npm install` at the repo root (the postinstall hook installs frontend deps), " +
        "or set BOT_EMBED_FRONTEND=0 to disable embedding."
    );
    return null;
  }

  const port = parseInt(process.env.FRONTEND_PORT || "3000", 10);
  const mode = process.env.BOT_FRONTEND_MODE || "dev"; // "dev" | "start"

  if (!process.env.CHAT_API_URL) {
    process.env.CHAT_API_URL = `http://localhost:${port}/api/chat`;
  }

  console.log(`[frontend] starting Next.js (${mode}) on :${port} …`);

  const child = spawn(
    process.execPath,
    [NEXT_BIN, mode, "--port", String(port)],
    {
      cwd: FRONTEND_DIR,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    }
  );

  child.on("error", (err) => {
    console.error("[frontend] failed to spawn:", err.message);
  });

  return child;
}

function stop(child, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      return finish();
    }
    setTimeout(() => {
      if (!done) {
        try { child.kill("SIGKILL"); } catch {}
        finish();
      }
    }, timeoutMs).unref();
  });
}

module.exports = { start, stop };
