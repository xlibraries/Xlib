# @xlibraries/photo-drop

A passcode-protected page where friends upload photos and videos straight into **your** Google Photos.
On xlibraries.com it's the hidden uploader at `/drop/` (also opened by the terminal command `upload`).

| Folder | |
| --- | --- |
| `web/` | the upload page: `index.html`, `app.js`, `sw.js` (background uploads on Android). Serve it as a folder and put a `config.js` next to it (below). |
| `backend/` | the Google Apps Script (`Code.gs`, `appsscript.json`) the page talks to |
| `tests/` | the backend's tests, run in a sandbox with fake Google services (`pnpm test`) |

`config.js` holds your settings:

```js
window.PHOTO_DROP = {
    endpoint: "https://script.google.com/macros/s/…/exec",   // the Apps Script web app URL (step 3 below)
    albumName: "Website Uploads",                            // must match ALBUM_TITLE
};
```

The endpoint isn't a secret: uploads are protected by the passcode, which the script checks. On
xlibraries.com, `apps/web/scripts/vendor.mjs` copies `web/` to `public/drop/` and the site's
`content/photo-drop.config.js` to `public/drop/config.js`.

## How it works

The page sends files to the Google Apps Script. It runs as you and saves everything to an album in **your** Google Photos, so
uploads use your storage, not your visitors'. Visitors need the passcode to upload.

> Google removed the API for adding to existing shared albums in March 2025. Uploads go into an album
> this script creates ("Website Uploads"). You can share that album from the Google Photos app.

## One-time setup (~15 min)

### 1. Google Cloud project
1. Open <https://console.cloud.google.com/>, create a project (e.g. "Photo Drop") and note its **project number** (on the Dashboard).
2. **APIs & Services → Library** → search **Photos Library API** → **Enable**.
3. **Google Auth Platform / OAuth consent screen** → set it up as **External**, with your email as the support and developer contact.
4. Under **Audience**, click **Publish app** (to *In production*). If you skip this, Google treats the app as "Testing" and your authorization expires after 7 days. You don't need verification for personal use.

### 2. Apps Script
1. Open <https://script.google.com/> → **New project**, name it "Photo Drop".
2. **Project Settings** (⚙️) → tick **Show "appsscript.json" manifest file in editor**.
3. Replace the contents of `Code.gs` and `appsscript.json` with the files in `backend/`.
4. **Project Settings → Google Cloud Platform (GCP) Project → Change project** → paste the project number from step 1.
5. **Project Settings → Script properties → Add**:
   | Property | Value |
   | --- | --- |
   | `PASSCODE` | the passcode you'll give people (required) |
   | `ALBUM_TITLE` | album name, default `Website Uploads` (optional) |
   | `MAX_FILE_MB` | per-file size limit in MB, no limit by default (optional) |
6. In the editor, choose the **`setup`** function → **Run** → approve the permissions. Google will show "Google hasn't verified this app" → **Advanced → Go to xlib's gallery**. The log should say `Album ready`, and the album appears in Google Photos.

### 3. Deploy
1. **Deploy → New deployment** → type **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → **Deploy**.
2. Copy the **Web app URL** (ends in `/exec`).
3. Paste it into your `config.js` as `endpoint`, and make `albumName` match `ALBUM_TITLE` (on xlibraries.com: [`apps/web/content/photo-drop.config.js`](../../apps/web/content/photo-drop.config.js)). Commit and push; Vercel deploys it.

## Sharing it
- Easiest for friends: `https://xlibraries.com/drop#k=YOUR_PASSCODE`. The passcode is in the part after `#`, which browsers never send to any server. The page removes it from the address bar and remembers it on that device.
- Or share `…/drop/` and tell people the passcode separately.

## Deploying changes from the repo

After the one-time setup above, `backend/` can be deployed with [clasp](https://github.com/google/clasp)
instead of pasting files into the editor:

1. Turn on the Apps Script API: <https://script.google.com/home/usersettings>.
2. Authorize clasp once: `pnpm --filter @xlibraries/photo-drop exec clasp login` (opens a browser).
3. Deploy: `photo-drop-deploy --script-id <Script ID> --deployment-id <ID from the /exec URL>`. It pushes
   `backend/` and points your existing deployment at the new version, so the `/exec` URL never changes.

On xlibraries.com: put `PHOTO_DROP_SCRIPT_ID=…` in `apps/web/.env.local` and run `pnpm deploy:photo-drop` from
the repo root (the deployment id is read from `content/photo-drop.config.js`).

## Admin status (optional)

The script can report its health to a site's admin panel: whether Google still accepts its authorization
(checked by opening a throwaway upload session), when it was last renewed, and the last 50 uploads (time, file
name, uploader's name). Ask for it with `{ "action": "admin", "adminKey": "…" }` from your server.

The key is never stored in the script: deploy with `--admin-key-hash <sha256 of the key>` and the deploy command
writes the hash into a `config.gs` for that push only. Each `setup` run records the renewal time, so the panel can
count down the 7 days Google allows while the consent screen is in Testing.

## Maintenance
- **Change the passcode:** edit the `PASSCODE` script property. It takes effect immediately and old links stop working.
- **Update the script:** `pnpm deploy:photo-drop` (above), or by hand: **Deploy → Manage deployments → ✏️ → Version: New version**. The URL stays the same.
- **Deleted the album?** Delete the `ALBUM_ID` script property and run `setup` again.
- **How bytes travel:** the script starts each upload and gives the browser Google's upload URL for that one file, so the bytes go straight to Google Photos (Android Chrome hands the whole file to its background transfer manager). If a browser can't reach Google directly, the page falls back to sending 8 MB pieces through the script.
- **Limits:** Google Photos accepts photos up to 200 MB and videos up to 20 GB. Direct uploads use only a few Apps Script calls per file; in the fallback, each 8 MB piece is one URL-fetch call, and consumer accounts get 20,000 of those per day.
