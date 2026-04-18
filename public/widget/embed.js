// Floating chat-widget launcher. Drop this on any page:
//   <script src="https://your-bot-host/widget.js" defer></script>
// It injects a bottom-right button that opens the widget in an iframe.
(function () {
  if (window.__seoWidgetLoaded) return;
  window.__seoWidgetLoaded = true;

  const host = new URL(document.currentScript ? document.currentScript.src : location.href).origin;

  const btn = document.createElement("button");
  btn.textContent = "Ask SEO";
  Object.assign(btn.style, {
    position: "fixed", bottom: "20px", right: "20px", zIndex: 2147483646,
    padding: "12px 18px", borderRadius: "999px", border: 0,
    background: "#4f46e5", color: "#fff", fontFamily: "system-ui, sans-serif",
    fontWeight: 600, fontSize: "14px", cursor: "pointer",
    boxShadow: "0 8px 24px rgba(79,70,229,.35)",
  });

  const frameWrap = document.createElement("div");
  Object.assign(frameWrap.style, {
    position: "fixed", bottom: "76px", right: "20px", width: "380px", height: "560px",
    maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 120px)",
    zIndex: 2147483647, borderRadius: "14px", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,.35)", display: "none", background: "#0f172a",
  });
  const frame = document.createElement("iframe");
  frame.src = `${host}/widget/`;
  frame.setAttribute("title", "SEO Keyword Agent");
  Object.assign(frame.style, { width: "100%", height: "100%", border: 0 });
  frameWrap.appendChild(frame);

  btn.addEventListener("click", () => {
    frameWrap.style.display = frameWrap.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(frameWrap);
    document.body.appendChild(btn);
  });
  if (document.readyState !== "loading") {
    document.body.appendChild(frameWrap);
    document.body.appendChild(btn);
  }
})();
