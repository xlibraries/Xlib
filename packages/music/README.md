# @xlibraries/music

An ad-free, sign-up-free music player app for the Xlib desktop ([xlibraries.com](https://xlibraries.com)):
YouTube playlists and search, a mini player, a Now Playing view with the video and synced lyrics.

- **Playback**: YouTube's embeddable player on `youtube-nocookie.com`.
- **Track lists and search**: [Invidious](https://invidious.io), an open-source YouTube front-end with a free
  JSON API. Public instances come and go, so the client tries each, remembers the one that works and
  discovers more from the public directory. If all are down, playlists still play straight from YouTube
  and titles are filled in via oEmbed.
- **Lyrics**: [LRCLIB](https://lrclib.net), matched to the video's title and length.

## Use

```tsx
import { createMusic } from '@xlibraries/music';

const Music = createMusic({
    playlists: [{ id: 'PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM', title: 'Top 100 Global' }],   // YouTube playlist ids
    snapshotUrl: '/music/snapshot.json',   // optional, see below
});

<Music host={host} />   // host from @xlibraries/app-sdk
```

## Instant playlists (snapshot)

Free Invidious servers can take seconds to answer. Save the track lists at build time and the app shows
them immediately, then refreshes in the background:

```sh
xlib-music-snapshot --playlists data/playlists.json --out public/music/snapshot.json
```

Playlists that fail keep their previous tracks, and the refresh stops after 90 seconds so a slow server
can't hold up a deploy.

## Notes

- Your Content Security Policy needs `script-src https://www.youtube.com https://s.ytimg.com`,
  `frame-src https:` and `connect-src https:` (Invidious instances are discovered at runtime).
- Styled with standard Tailwind utility classes (add the package's `src/**/*.tsx` to your Tailwind `content`);
  slider and scrollbar styles are built in.
- Ships TypeScript source; compile it with your bundler (in Next.js: `transpilePackages`).
- Tests: `pnpm test` (Vitest).
