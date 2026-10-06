(function () {
  function getDocHeight() {
    const body = document.body;
    const html = document.documentElement;

    // Robust height (handles fixed/absolute elements and overflow)
    return Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.clientHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0
    );
  }

  function postHeight() {
    const height = getDocHeight();
    window.parent.postMessage(
      { type: "DASH_HEIGHT", height: height },
      window.location.origin
    );
  }

  // Debounce so we don't spam postMessage during rapid DOM changes
  let t = null;
  function postHeightSoon() {
    if (t) {
      clearTimeout(t);
    }
    t = setTimeout(postHeight, 50);
  }

  // 1) Initial load
  window.addEventListener("load", function () {
    postHeightSoon();
    setTimeout(postHeightSoon, 200);
    setTimeout(postHeightSoon, 800);
  });

  // 2) Parent can request height anytime
  window.addEventListener("message", function (e) {
    if (!e || !e.data || e.origin !== window.location.origin || e.source !== window.parent) return;
    if (e.data.type === "DASH_HEIGHT_REQUEST") {
      postHeightSoon();
    }
  });

  // 3) Observe DOM changes (callbacks, tab switches, DataTable updates, expand panels, etc.)
  const mo = new MutationObserver(function () {
    postHeightSoon();
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  // 4) Also react to viewport/layout changes
  window.addEventListener("resize", postHeightSoon);
})();
