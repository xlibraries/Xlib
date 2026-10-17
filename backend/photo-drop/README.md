# Photo Drop backend

The hidden uploader at `/drop/` (also opened by the terminal command `upload`) sends files to this
Google Apps Script. It runs as you and saves everything to an album in **your** Google Photos, so
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
3. Replace the contents of `Code.gs` and `appsscript.json` with the files in this folder.
4. **Project Settings → Google Cloud Platform (GCP) Project → Change project** → paste the project number from step 1.
5. **Project Settings → Script properties → Add**:
   | Property | Value |
   | --- | --- |
   | `PASSCODE` | the passcode you'll give people (required) |
   | `ALBUM_TITLE` | album name, default `Website Uploads` (optional) |
   | `MAX_FILE_MB` | per-file size limit, default `4096` (optional) |
6. In the editor, choose the **`setup`** function → **Run** → approve the permissions. Google will show "Google hasn't verified this app" → **Advanced → Go to Photo Drop**. The log should say `Album ready`, and the album appears in Google Photos.

### 3. Deploy
1. **Deploy → New deployment** → type **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → **Deploy**.
2. Copy the **Web app URL** (ends in `/exec`).
3. Paste it into [`public/drop/config.js`](../../public/drop/config.js) as `endpoint`, and make `albumName` match `ALBUM_TITLE`. Commit and deploy the site.

## Sharing it
- Easiest for friends: `https://xlibraries.github.io/Xlib/drop/#k=YOUR_PASSCODE`. The passcode is in the part after `#`, which browsers never send to any server. The page removes it from the address bar and remembers it on that device.
- Or share `…/drop/` and tell people the passcode separately.

## Maintenance
- **Change the passcode:** edit the `PASSCODE` script property. It takes effect immediately and old links stop working.
- **Update the script:** **Deploy → Manage deployments → ✏️ → Version: New version**. The URL stays the same.
- **Deleted the album?** Delete the `ALBUM_ID` script property and run `setup` again.
- **Limits:** Google Photos accepts photos up to 200 MB and videos up to 20 GB. Each 8 MB piece of a file is one Apps Script URL-fetch call, and consumer accounts get 20,000 of those per day.
