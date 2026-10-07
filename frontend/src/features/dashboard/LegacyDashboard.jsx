import React from "react";
import { useEffect } from "react";

const DASH_ORIGIN = window.location.origin;

export default function LegacyDashboard({ view = "summary" }) {
  const iframeRef = React.useRef(null);
  const [iframeHeight, setIframeHeight] = React.useState(300);

  useEffect(() => {
    function onMsg(e) {
      if (!e || !e.data) return;

      // Important: ignore messages from other iframes/windows
      if (e.origin !== DASH_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;

      if (e.data.type !== "DASH_HEIGHT") return;

      const next = Number(e.data.height);
      if (!Number.isFinite(next) || next <= 0) return;

      setIframeHeight((prev) => {
        if (Math.abs(prev - next) <= 2) return prev;
        return next;
      });
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function requestDashHeight() {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    // Ask Dash to send height (handled by iframe_height.js)
    iframe.contentWindow.postMessage({ type: "DASH_HEIGHT_REQUEST" }, DASH_ORIGIN);
  }
  return (
    <div className="page-shell">
      <div className="card-surface">
        <iframe
          ref={iframeRef}
          title="Dash Dashboard"
          src={`/dash/?view=${view}`}
          style={{
            width: "100%",
            height: iframeHeight,
            border: "0",
            display: "block",
            overflow: "hidden",
            transition: "height 120ms ease",
          }}

          onLoad={requestDashHeight}
          scrolling="no"
        />
      </div>
    </div>
  );
}
