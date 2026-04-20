import { readFileSync } from "fs";
import { join } from "path";
import LandingPageFix from "@/components/LandingPageFix";

// Server Component — reads the pre-built landing page HTML and serves it
// The root layout.tsx is a pass-through (returns children directly)
// so this component owns the full <html>...<body>...</body></html> structure

// removed force-static so dev server picks up changes

export default function LandingPage() {
  // Read the static landing page HTML from the /landing directory
  const htmlPath = join(process.cwd(), "landing", "index.html");
  // Trigger HMR
  const html = readFileSync(htmlPath, "utf-8");

  // Extract head contents (styles, etc)
  const headMatch = html.match(/<head[^>]*>([\s\S]*)<\/head>/);
  const headContent = headMatch ? headMatch[1] : "";

  // Extract styles specifically to avoid injecting non-style head tags into the body
  const styleMatch = headContent.match(/<style[^>]*>([\s\S]*)<\/style>/g);
  const cleanStyles = styleMatch ? styleMatch.join("\n") : "";

  // Extract body contents
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  let bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Strip all inline <script> tags — interactivity is owned by LandingPageFix.
  // Leaving them in causes duplicate event handlers (both fire on tap, cancelling
  // the mobile-nav toggle, smooth-scroll, etc.).
  bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, "");

  return (
    <>
      <LandingPageFix />
      <div dangerouslySetInnerHTML={{ __html: cleanStyles }} />
      <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
    </>
  );
}
