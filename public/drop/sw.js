// Photo Drop service worker: finishes uploads handed to Chrome's Background Fetch, which keeps
// running when the page is in the background or closed, and regardless of other apps playing audio.
self.window = self;
importScripts("./config.js");

const channel = new BroadcastChannel("photo-drop");
const albumName = (self.PHOTO_DROP && self.PHOTO_DROP.albumName) || "Photo Drop";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Every chunk's response must be OK, and the final one must confirm the file was saved
async function checkResponses(registration) {
    const records = await registration.matchAll();
    let done = false;
    let error = null;
    for (const record of records) {
        const response = await record.responseReady.catch(() => null);
        const data = response && response.ok ? await response.json().catch(() => null) : null;
        if (!data) error = error || "Lost connection to the uploader";
        else if (data.error) error = error || data.error;
        else if (data.done) done = true;
    }
    return { done: done && !error, error: error || (done ? null : "Upload didn't finish") };
}

async function finish(event, failureReason) {
    const result = await checkResponses(event.registration).catch(() => ({ done: false, error: "Upload failed" }));
    if (!result.done && failureReason) result.error = result.error || failureReason;
    await event.updateUI({
        title: result.done ? "Uploaded to " + albumName + " ✓" : "Upload interrupted — open Photo Drop to retry",
    }).catch(() => { });
    channel.postMessage(Object.assign({ id: event.registration.id }, result));
}

self.addEventListener("backgroundfetchsuccess", (event) => event.waitUntil(finish(event)));
self.addEventListener("backgroundfetchfail", (event) => event.waitUntil(finish(event, event.registration.failureReason)));
self.addEventListener("backgroundfetchabort", (event) => {
    channel.postMessage({ id: event.registration.id, done: false, error: "Upload cancelled" });
});
self.addEventListener("backgroundfetchclick", (event) => event.waitUntil(self.clients.openWindow("./index.html")));
