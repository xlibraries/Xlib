// Photo Drop page logic (kept out of index.html so the security policy needs no inline scripts)
(function () {
    "use strict";

    const config = window.PHOTO_DROP || {};
    const CHUNK_SIZE = 8 * 1024 * 1024; // raw bytes per request through Apps Script (~11 MB once base64-encoded)
    const DIRECT_CHUNK_SIZE = 32 * 1024 * 1024; // raw bytes per request straight to Google
    const PARALLEL_FILES = 2;
    const MAX_RETRIES = 5;

    const $ = (id) => document.getElementById(id);
    const store = {
        get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } },
        remove: (k) => { try { localStorage.removeItem(k); } catch (e) { } },
    };

    const EXT_TYPES = {
        heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", dng: "image/x-adobe-dng", mov: "video/quicktime",
        mp4: "video/mp4", m4v: "video/x-m4v", "3gp": "video/3gpp", mkv: "video/x-matroska",
        avi: "video/x-msvideo", webm: "video/webm",
    };

    let passcode = "";
    let maxFileMb = 0; // 0 = no limit (set MAX_FILE_MB in the backend to add one)
    const queue = [];
    let active = 0;
    let wakeLock = null;

    // ---------- API ----------

    class ApiError extends Error {
        constructor(message, fatal, code) { super(message); this.fatal = fatal; this.code = code; }
    }

    async function api(body) {
        let res;
        try {
            // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires
            res = await fetch(config.endpoint, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(Object.assign({ passcode }, body)),
            });
        } catch (e) {
            throw new ApiError("Network problem — retrying…", false);
        }
        let data;
        try { data = await res.json(); } catch (e) { throw new ApiError("Unexpected server response", false); }
        if (data.error) throw new ApiError(data.error, !!data.fatal, data.code);
        return data;
    }

    // ---------- Step 1: passcode ----------

    async function unlock(code, silent) {
        passcode = code;
        $("unlock").disabled = true;
        $("lock-error").textContent = "";
        try {
            const info = await api({ action: "check" });
            if (info.maxFileMb) maxFileMb = info.maxFileMb;
            store.set("drop-passcode", code);
            showUploader();
        } catch (e) {
            if (e.code === "passcode") store.remove("drop-passcode");   // keep it when merely closed or offline
            show("lock");
            if (!silent || e.code !== "passcode") $("lock-error").textContent = e.code === "passcode" ? "That passcode isn't right." : e.message;
        } finally {
            $("unlock").disabled = false;
        }
    }

    function show(id) {
        ["setup-needed", "lock", "uploader"].forEach(x => $(x).classList.toggle("hidden", x !== id));
    }

    function showUploader() {
        show("uploader");
        $("subtitle").textContent = "Uploading to “" + (config.albumName || "Website Uploads") + "”";
        $("name").value = store.get("drop-name") || "";
    }

    // ---------- Step 2: files ----------

    function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        $("queue-card").classList.remove("hidden");
        $("done").classList.add("hidden");

        files.forEach(file => {
            const type = file.type || EXT_TYPES[(file.name.split(".").pop() || "").toLowerCase()] || "";
            const item = { file, type, sent: 0, status: "waiting", error: "" };
            item.el = renderItem(item);
            $("queue").appendChild(item.el.root);

            if (!/^(image|video)\//.test(type)) fail(item, "Not a photo or video", true);
            else if (maxFileMb && file.size > maxFileMb * 1024 * 1024) fail(item, "Too large (max " + formatSize(maxFileMb * 1024 * 1024) + ")", true);
            queue.push(item);
        });
        updateSummary();
        pump();
    }

    function renderItem(item) {
        const root = document.createElement("li");
        const thumb = document.createElement("div");
        thumb.className = "thumb";
        thumb.textContent = /^video\//.test(item.type) ? "🎬" : /^image\//.test(item.type) ? "🖼️" : "📄";
        const url = URL.createObjectURL(item.file);
        if (/^image\//.test(item.type)) {
            const img = new Image();
            img.onload = () => { thumb.textContent = ""; thumb.appendChild(img); };
            img.src = url;
        } else if (/^video\//.test(item.type)) {
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.onloadeddata = () => { thumb.textContent = ""; thumb.appendChild(video); };
            video.src = url + "#t=0.1";
        }

        const info = document.createElement("div");
        info.className = "info";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = item.file.name;
        const meta = document.createElement("div");
        meta.className = "meta";
        const bar = document.createElement("div");
        bar.className = "bar";
        const fill = document.createElement("div");
        bar.appendChild(fill);
        info.append(name, meta, bar);

        const retry = document.createElement("button");
        retry.className = "icon-btn hidden";
        retry.type = "button";
        retry.title = "Retry";
        retry.textContent = "↻";
        retry.onclick = () => {
            item.status = "waiting";
            item.sent = 0;
            item.error = "";
            retry.classList.add("hidden");
            paint(item);
            updateSummary();
            pump();
        };

        root.append(thumb, info, retry);
        const el = { root, meta, fill, retry };
        item.el = el;
        paint(item);
        return el;
    }

    function paint(item) {
        const { meta, fill, retry } = item.el;
        const pct = item.file.size ? Math.round((item.sent / item.file.size) * 100) : 0;
        meta.className = "meta" + (item.status === "done" ? " ok" : item.status === "failed" ? " err" : "");
        meta.textContent =
            item.status === "done" ? "✓ Uploaded · " + formatSize(item.file.size) :
            item.status === "failed" ? item.error :
            item.status === "uploading" ? (item.note ||
                (item.background && pct >= 100 ? "Finishing up…" : pct + "% of " + formatSize(item.file.size) + (item.background ? " · continues in background" : ""))) :
            "Waiting · " + formatSize(item.file.size);
        fill.style.width = (item.status === "done" ? 100 : pct) + "%";
        retry.classList.toggle("hidden", !(item.status === "failed" && item.retryable));
    }

    function fail(item, message, permanent) {
        item.status = "failed";
        item.error = message;
        item.retryable = !permanent;
        paint(item);
    }

    function pump() {
        while (active < PARALLEL_FILES) {
            const next = queue.find(i => i.status === "waiting");
            if (!next) break;
            active++;
            next.status = "uploading";
            refreshKeepAlive();
            uploadFile(next)
                .then(() => { next.status = "done"; next.sent = next.file.size; })
                .catch(e => fail(next, e.message, e.fatal && e.code !== "passcode"))
                .finally(() => {
                    active--;
                    paint(next);
                    updateSummary();
                    pump();
                });
        }
        refreshKeepAlive();
        if (!active) {
            const finished = queue.filter(i => i.status === "done").length;
            const skipped = queue.filter(i => i.status === "failed" && !i.retryable).length;
            const retryable = queue.filter(i => i.status === "failed" && i.retryable).length;
            if (queue.length && !queue.some(i => i.status === "waiting" || i.status === "uploading")) {
                $("done").classList.toggle("hidden", retryable > 0 || finished === 0);
                $("done-text").textContent = finished + " file" + (finished === 1 ? "" : "s") + " uploaded" +
                    (skipped ? " · " + skipped + " skipped" : "") + ".";
            }
        }
    }

    // Set when this browser can't send to Google directly (e.g. CORS refused): use the relay from then on
    let directBlocked = false;

    async function uploadFile(item) {
        const uploader = $("name").value.trim();
        store.set("drop-name", uploader);

        const { uploadId, granularity, uploadUrl } = await withRetry(item, () => api({
            action: "start", fileName: item.file.name, mimeType: item.type, size: item.file.size,
            direct: !directBlocked, origin: location.origin,
        }));

        // Chunks must be a multiple of Google's granularity (except the last one)
        const g = granularity || 262144;
        const sizeFor = (target) => Math.max(g, Math.floor(target / g) * g);

        if (uploadUrl && !directBlocked) {
            const result = await uploadDirect(item, uploadId, uploadUrl, sizeFor(DIRECT_CHUNK_SIZE), uploader);
            if (result === "done") return;
            directBlocked = true; // nothing reached Google; send this file and the rest through Apps Script
            item.sent = 0;
        }
        await uploadInPage(item, uploadId, sizeFor(CHUNK_SIZE), uploader, 0);
    }

    // ---------- Direct upload (browser → Google Photos) ----------
    // Raw bytes go straight to the file's resumable upload URL; Apps Script only starts the upload,
    // reports progress for resuming, and adds the finished file to the album.
    // Returns "done", or "blocked" if Google never accepted a byte from this browser.

    async function uploadDirect(item, uploadId, uploadUrl, chunkSize, uploader) {
        let offset = 0;
        let uploadToken = "";
        let accepted = false;

        if (swRegistration) {
            const result = await uploadInBackground(item, uploadId, uploadUrl, uploader);
            if (result.done) return "done";
            if (result.uploadToken) uploadToken = result.uploadToken; // bytes are in; only the album step failed
            else if (result.started) {
                // Finish from this page, starting wherever Google got to
                const status = await withRetry(item, () => api({ action: "status", uploadId }));
                if (status.done) return "done";
                offset = status.received || 0;
                accepted = offset > 0;
            }
        }

        let failures = 0;
        while (!uploadToken) {
            const end = Math.min(offset + chunkSize, item.file.size);
            const final = end === item.file.size;
            try {
                const text = await sendDirect(uploadUrl, item.file.slice(offset, end), offset, final, (loaded) => {
                    item.sent = offset + loaded;
                    paint(item);
                    updateSummary();
                });
                accepted = true;
                failures = 0;
                offset = end;
                item.sent = offset;
                item.note = "";
                paint(item);
                if (final) uploadToken = text.trim();
            } catch (e) {
                failures++;
                if (!accepted && failures >= 2) return "blocked";
                if (failures > MAX_RETRIES) throw new ApiError("Upload stopped — check your connection and tap retry", false);
                item.note = "Connection hiccup — retrying…";
                paint(item);
                await sleep(Math.min(30000, 1000 * 2 ** failures));
                // Ask Google how much it already has, then resume from there
                try {
                    const status = await api({ action: "status", uploadId });
                    if (status.done) return "done";
                    if (typeof status.received === "number" && status.received <= item.file.size) offset = status.received;
                } catch (err) { }
            }
        }
        if (!uploadToken) throw new ApiError("Google Photos didn't confirm the upload", false);

        item.note = "Saving to album…";
        paint(item);
        await withRetry(item, () => api({ action: "finish", uploadId, uploadToken, uploader, fileName: item.file.name }));
        item.note = "";
        return "done";
    }

    // XHR rather than fetch, for upload progress within each 32 MB piece. Resolves with the response text.
    function sendDirect(url, blob, offset, final, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-Goog-Upload-Command", final ? "upload, finalize" : "upload");
            xhr.setRequestHeader("X-Goog-Upload-Offset", String(offset));
            xhr.upload.onprogress = (e) => onProgress(e.loaded);
            xhr.onload = () => xhr.status === 200 ? resolve(xhr.responseText) : reject(new Error("HTTP " + xhr.status));
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(blob);
        });
    }

    // ---------- Relay upload (browser → Apps Script → Google Photos) ----------

    async function uploadInPage(item, uploadId, chunkSize, uploader, offset) {
        let failures = 0;

        for (;;) {
            const end = Math.min(offset + chunkSize, item.file.size);
            const final = end === item.file.size;
            try {
                const data = await toBase64(item.file.slice(offset, end));
                const res = await api({ action: "chunk", uploadId, offset, data, final, uploader });
                offset = end;
                item.sent = offset;
                item.note = "";
                failures = 0;
                paint(item);
                updateSummary();
                if (final && res.done) return;
            } catch (e) {
                if (e.fatal || ++failures > MAX_RETRIES) throw e;
                item.note = "Connection hiccup — retrying…";
                paint(item);
                await sleep(Math.min(30000, 1000 * 2 ** failures));
                // Ask Google how much it already has, then resume from there
                try {
                    const status = await api({ action: "status", uploadId });
                    if (typeof status.received === "number" && status.received <= item.file.size) offset = status.received;
                } catch (err) { }
            }
        }
    }

    // ---------- Background Fetch (Android Chrome) ----------
    // Chrome's transfer manager sends the whole file to Google as one system task with its own
    // notification, so the upload continues with the page in the background or closed, whatever
    // other apps are playing. The service worker then adds it to the album (see sw.js).
    // Resolves with { done, uploadToken?, started, error? }.

    let swRegistration = null;
    const pendingBackground = new Map();
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("photo-drop") : null;
    if (channel) {
        channel.onmessage = (e) => {
            const resolve = pendingBackground.get(e.data.id);
            if (resolve) { pendingBackground.delete(e.data.id); resolve(e.data); }
        };
    }

    if (channel && "serviceWorker" in navigator && "BackgroundFetchManager" in window && "caches" in window) {
        navigator.serviceWorker.register("./sw.js")
            .then(() => navigator.serviceWorker.ready)
            .then(reg => {
                if (!reg.backgroundFetch) return;
                swRegistration = reg;
                return reg.backgroundFetch.getIds().then(ids => {
                    if (ids.length) {
                        $("bg-note").textContent = ids.length + " upload" + (ids.length === 1 ? " is" : "s are") + " still finishing in the background — see your notifications.";
                        $("bg-note").classList.remove("hidden");
                    }
                });
            })
            .catch(() => { });
    }

    async function uploadInBackground(item, uploadId, uploadUrl, uploader) {
        const id = "drop-" + uploadId;
        // What the service worker needs to add the file to the album, even if this page is closed
        const pending = await caches.open("photo-drop-pending");
        await pending.put("./pending/" + id, new Response(JSON.stringify({
            endpoint: config.endpoint, passcode, uploadId, uploader, fileName: item.file.name,
        })));

        let registration;
        try {
            registration = await swRegistration.backgroundFetch.fetch(id, [new Request(uploadUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "X-Goog-Upload-Command": "upload, finalize",
                    "X-Goog-Upload-Offset": "0",
                },
                body: item.file,
            })], {
                title: "Uploading " + item.file.name,
                icons: [{ src: artworkUrl(), sizes: "256x256", type: "image/png" }],
            });
        } catch (e) {
            await pending.delete("./pending/" + id).catch(() => { });
            return { done: false, started: false };
        }

        item.background = true;
        item.note = "";
        refreshKeepAlive();
        paint(item);

        const result = await new Promise(resolve => {
            pendingBackground.set(registration.id, resolve);
            registration.addEventListener("progress", () => {
                if (registration.uploadTotal) item.sent = Math.round(item.file.size * registration.uploaded / registration.uploadTotal);
                paint(item);
                updateSummary();
                // Safety net in case the service worker's message never arrives
                if (registration.result === "failure") setTimeout(() => resolve({ done: false }), 15000);
            });
        });
        pendingBackground.delete(registration.id);
        item.background = false;
        refreshKeepAlive();

        if (result.error && /passcode/i.test(result.error)) throw new ApiError(result.error, true, "passcode");
        return Object.assign({ started: true }, result);
    }

    async function withRetry(item, fn) {
        for (let attempt = 1; ; attempt++) {
            try { return await fn(); } catch (e) {
                if (e.fatal || attempt > MAX_RETRIES) throw e;
                item.note = "Connection hiccup — retrying…";
                paint(item);
                await sleep(Math.min(30000, 1000 * 2 ** attempt));
            }
        }
    }

    function toBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = () => reject(new ApiError("Couldn't read the file", true));
            reader.readAsDataURL(blob);
        });
    }

    function updateSummary() {
        const total = queue.reduce((s, i) => s + i.file.size, 0);
        const sent = queue.reduce((s, i) => s + (i.status === "done" ? i.file.size : i.sent), 0);
        const done = queue.filter(i => i.status === "done").length;
        $("summary-text").innerHTML = "<b>" + done + " / " + queue.length + "</b> uploaded";
        $("summary-size").textContent = formatSize(sent) + " of " + formatSize(total);
        $("total-bar").style.width = (total ? Math.round((sent / total) * 100) : 0) + "%";
        updateMediaSession(done, queue.length, total ? Math.round((sent / total) * 100) : 0);
    }

    // ---------- Phone comfort ----------

    // Background Fetch uploads don't need the page; only in-page ones (or ones still preparing) do
    const needsPage = () => queue.some(i => i.status === "uploading" && !i.background);

    function refreshKeepAlive() {
        keepAwake(needsPage());
    }

    async function keepAwake(on) {
        backgroundAudio(on);
        try {
            if (on && !wakeLock && navigator.wakeLock) {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener("release", () => { wakeLock = null; });
            } else if (!on && wakeLock) {
                await wakeLock.release();
                wakeLock = null;
            }
        } catch (e) { }
    }

    // Android freezes background tabs, but not ones playing audio. While uploads run, loop a
    // 30 Hz tone at about -54 dBFS: below human hearing and phone-speaker range, yet not digital
    // silence (Chrome ignores silent audio when deciding whether a tab is "playing").
    let audio = null;

    function keepAliveTrack() {
        const rate = 8000, samples = rate * 2; // 2 s = exactly 60 cycles, so it loops seamlessly
        const view = new DataView(new ArrayBuffer(44 + samples * 2));
        const text = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE");
        text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        text(36, "data"); view.setUint32(40, samples * 2, true);
        for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 30 * i / rate) * 64), true);
        return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
    }

    // Called from a tap so the browser allows playback later, when uploads actually start
    function primeAudio() {
        if (audio) return;
        audio = new Audio(keepAliveTrack());
        audio.loop = true;
        audio.play().then(() => { if (!active) audio.pause(); }).catch(() => { });
        if ("mediaSession" in navigator) {
            // Pausing from the notification would let Android freeze the upload, so ignore it
            ["play", "pause", "stop"].forEach(action => {
                try { navigator.mediaSession.setActionHandler(action, () => audio.play().catch(() => { })); } catch (e) { }
            });
        }
    }

    function backgroundAudio(on) {
        if (!audio) return;
        if (on) audio.play().catch(() => { });
        else {
            audio.pause();
            if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
        }
    }

    // Progress in Android's notification shade / lock screen
    let artwork = null;
    let lastMediaText = "";
    function updateMediaSession(done, count, pct) {
        if (!("mediaSession" in navigator) || !window.MediaMetadata || !needsPage()) return;
        const title = "Uploading " + Math.min(done + 1, count) + " of " + count + "…";
        const text = title + pct;
        if (text === lastMediaText) return;
        lastMediaText = text;
        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist: pct + "% · " + (config.albumName || "Photo Drop"),
            artwork: [{ src: artworkUrl(), sizes: "256x256", type: "image/png" }],
        });
    }

    function artworkUrl() {
        if (!artwork) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 256;
            const ctx = canvas.getContext("2d");
            const gradient = ctx.createLinearGradient(0, 0, 256, 256);
            gradient.addColorStop(0, "#F7752B");
            gradient.addColorStop(1, "#9B1D5A");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 256);
            ctx.font = "140px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("📸", 128, 140);
            artwork = canvas.toDataURL("image/png");
        }
        return artwork;
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && needsPage()) keepAwake(true);
    });

    window.addEventListener("beforeunload", (e) => {
        if (needsPage()) { e.preventDefault(); e.returnValue = ""; }
    });

    // ---------- Utils ----------

    function formatSize(bytes) {
        if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---------- Wire up ----------

    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) {
        $("camera").classList.remove("hidden");
        $("drop-hint").textContent = "Pick from your gallery or take a new one";
    }

    $("pick").onclick = () => { primeAudio(); $("files").click(); };
    $("camera").onclick = () => { primeAudio(); $("camera-input").click(); };
    $("files").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
    $("camera-input").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
    $("lock").onsubmit = (e) => { e.preventDefault(); unlock($("passcode").value.trim()); };

    document.addEventListener("pointerdown", primeAudio, { once: true });

    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => {
        if ($("uploader").classList.contains("hidden")) return;
        e.preventDefault();
        dragDepth++;
        document.body.classList.add("dragging");
    });
    window.addEventListener("dragleave", () => {
        if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); }
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragDepth = 0;
        document.body.classList.remove("dragging");
        if (!$("uploader").classList.contains("hidden")) addFiles(e.dataTransfer.files);
    });

    // Start: passcode can come from a share link (#k=...), else the one saved on this device
    if (!config.endpoint) {
        show("setup-needed");
    } else {
        const fromLink = new URLSearchParams(location.hash.slice(1)).get("k");
        if (fromLink) history.replaceState(null, "", location.pathname + location.search);
        const saved = fromLink || store.get("drop-passcode");
        if (saved) {
            $("passcode").value = saved;
            unlock(saved, true);
        } else {
            show("lock");
        }
    }
})();
