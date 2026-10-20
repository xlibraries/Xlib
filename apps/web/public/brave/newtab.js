// Brave new tab page logic (kept out of newtab.html so the security policy needs no inline scripts)
(function () {
    "use strict";

    // In-window results: Bing's results page is one of the few that allows being framed
    const IN_WINDOW = (q) => "https://www.bing.com/search?q=" + encodeURIComponent(q);
    const NEW_TAB = {
        brave: (q) => "https://search.brave.com/search?q=" + encodeURIComponent(q),
        ddg: (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q),
        google: (q) => "https://www.google.com/search?q=" + encodeURIComponent(q),
    };

    const looksLikeUrl = (text) => /^(https?:\/\/)?(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(text);

    const input = document.getElementById("q");
    const insideBrowser = window.parent !== window;

    // Inside the desktop's Brave app, let it navigate (tabs, history, framing checks); otherwise go directly
    function go(target) {
        if (insideBrowser) window.parent.postMessage({ type: "brave:navigate", input: target }, location.origin);
        else location.href = looksLikeUrl(target) ? (/^https?:\/\//i.test(target) ? target : "https://" + target) : IN_WINDOW(target);
    }

    document.getElementById("search").addEventListener("submit", (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) go(q);
    });

    document.querySelectorAll("[data-go]").forEach((tile) => {
        tile.addEventListener("click", (e) => { e.preventDefault(); go(tile.getAttribute("href")); });
    });

    document.querySelectorAll("[data-engine]").forEach((button) => {
        button.addEventListener("click", () => {
            const q = input.value.trim();
            const engine = NEW_TAB[button.dataset.engine];
            window.open(q ? engine(q) : engine("").replace(/[?&]q=$|\?$/, "").replace(/\/search$/, "/"), "_blank", "noopener");
        });
    });

    function tick() {
        const now = new Date();
        document.getElementById("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        document.getElementById("date").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    }
    tick();
    setInterval(tick, 10000);
})();
