// Interactive CLI — type a query, get the report, optionally save the PDF.
// Zero external deps (uses built-in readline).
//
// Enable by setting BOT_CLI_ENABLED=1  (or run `node adapters/cli.js` directly).
// Commands: :help, :quit, :save <path>

const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

function start() {
  if (process.env.BOT_CLI_ENABLED !== "1" && require.main !== module) {
    return;
  }
  activity.registerAdapter("cli", "ready");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "seo> ",
  });

  let lastResult = null;

  function help() {
    console.log(`
Commands:
  <query>          Ask the agent and print the report
  :save <path>     Save the last generated PDF to <path>
  :help            Show this help
  :quit            Exit
`);
  }

  console.log("▶ SEO CLI — type a question, or :help");
  rl.prompt();

  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) return rl.prompt();

    if (line === ":quit" || line === ":exit") { rl.close(); return; }
    if (line === ":help") { help(); return rl.prompt(); }
    if (line.startsWith(":save")) {
      const target = line.slice(5).trim() || "seo-report.pdf";
      if (!lastResult?.pdfBuffer) {
        console.log("  (no PDF available yet — run a query first)");
      } else {
        fs.writeFileSync(path.resolve(target), lastResult.pdfBuffer);
        console.log(`  saved → ${path.resolve(target)}`);
      }
      return rl.prompt();
    }

    try {
      const result = await handleQuery(line, { adapter: "cli", user: "local" });
      console.log("\n" + result.report + "\n");
      if (result.pdfBuffer) {
        console.log(`  (PDF ready · use  :save ${result.filename}  to export)\n`);
      }
      lastResult = result;
    } catch (err) {
      console.error(`\n  ⚠ ${err.userFacing || humanizeError(err.message)}\n`);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("bye");
    process.exit(0);
  });
}

if (require.main === module) start();
module.exports = { start };
