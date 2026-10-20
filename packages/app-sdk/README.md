# @xlibraries/app-sdk

The contract between the Xlib desktop ([xlibraries.com](https://xlibraries.com)) and the apps that run in
its windows. Every app is a React component that receives one prop, `host`:

```tsx
import type { AppProps } from '@xlibraries/app-sdk';

export default function MyApp({ host }: AppProps) {
    return <button onClick={() => host.openApp('music')}>Play something</button>;
}
```

| `host.` | |
| --- | --- |
| `openApp(id)` | open or focus another app's window |
| `addFolder(name)` | create a folder on the desktop |
| `wallpaper` / `setWallpaper(name)` | read or change the wallpaper |
| `track(event)` | analytics event (`{ category, action, label?, value? }`); no-op when analytics are off |

Types only: there's no runtime code, so an app can be used in any site that provides a `Host`.
