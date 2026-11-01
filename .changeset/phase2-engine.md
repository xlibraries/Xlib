---
"@xlibraries/engine-core": minor
"@xlibraries/engine-web": minor
"@xlibraries/engine-react": minor
"@xlibraries/engine-audio": minor
"@xlibraries/engine-text": minor
"@xlibraries/physics-3d": minor
"@xlibraries/arcade": minor
"@xlibraries/bot-lab": minor
---

The engine as separate packages: engine-core (the platform contract, xl.h), engine-web (its browser implementation, linked; games no longer define XL_IMPL), engine-react (EngineView), engine-audio, engine-text, physics-3d. They replace @xlibraries/engine; a module lists the ones it links in "uses".
