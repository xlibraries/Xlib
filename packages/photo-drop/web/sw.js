// Photo Drop service worker: finishes uploads handed to Chrome's Background Fetch, which keeps
// running when the page is in the background or closed, and regardless of other apps playing audio.
// Each Background Fetch sends one whole file straight to Google Photos; this worker then asks the
// Apps Script backend to add it to the album, using details the page left in Cache Storage.
self.window = self;
importScripts("./config.js");

const channel = new BroadcastChannel("photo-drop");
const albumName = (self.PHOTO_DROP && self.PHOTO_DROP.albumName) || "Photo Drop";
const PENDING = "photo-drop-pending";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google answers the finalizing request with an upload token; trade it for an album entry
async function finishUpload(registration) {
    const pending = await caches.open(PENDING);
    const key = "./pending/" + registration.id;
    const saved = await pending.match(key);
    const info = saved ? await saved.json() : null;
    if (!info) return { done: false, error: "Upload details were lost" };

    const record = (await registration.matchAll())[0];
    const response = record && await record.responseReady.catch(() => null);
    const uploadToken = response && response.ok ? (await response.text().catch(() => "")).trim() : "";
    if (!uploadToken) return { done: false, error: "Google Photos didn't accept the upload" };

    let error = "Couldn't save to the album";
    for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt) await sleep(2000 * 2 ** attempt);
        try {
            const res = await fetch(info.endpoint, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    passcode: info.passcode, action: "finish", uploadId: info.uploadId,
                    uploadToken, uploader: info.uploader, fileName: info.fileName,
                }),
            });
            const data = await res.json();
            if (data.done) {
                await pending.delete(key);
                return { done: true };
            }
            error = data.error || error;
            if (data.fatal) break;
        } catch (e) { }
    }
    // The page (if open) can retry the album step with this token
    return { done: false, error, uploadToken };
}

async function finish(event, failureReason) {
    const result = failureReason
        ? { done: false, error: failureReason }
        : await finishUpload(event.registration).catch(() => ({ done: false, error: "Upload failed" }));
    if (failureReason) await caches.open(PENDING).then((c) => c.delete("./pending/" + event.registration.id)).catch(() => { });
    await event.updateUI({
        title: result.done ? "Uploaded to " + albumName + " ✓" : "Upload interrupted — open Photo Drop to retry",
    }).catch(() => { });
    channel.postMessage(Object.assign({ id: event.registration.id }, result));
}

self.addEventListener("backgroundfetchsuccess", (event) => event.waitUntil(finish(event)));
self.addEventListener("backgroundfetchfail", (event) => event.waitUntil(finish(event, event.registration.failureReason || "Upload failed")));
self.addEventListener("backgroundfetchabort", (event) => {
    event.waitUntil(caches.open(PENDING).then((c) => c.delete("./pending/" + event.registration.id)).catch(() => { }));
    channel.postMessage({ id: event.registration.id, done: false, error: "Upload cancelled" });
});
self.addEventListener("backgroundfetchclick", (event) => event.waitUntil(self.clients.openWindow("./index.html")));
