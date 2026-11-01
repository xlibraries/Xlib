# Changesets

Every change to a package carries a changeset: `pnpm changeset`, pick the packages, pick the kind, write one line.
Every merged changeset releases (docs/streams-plan.md §4).

| Kind of change | Pick | Example |
| --- | --- | --- |
| **Major**: a big change, or one you can't roll back (a breaking API, a save format) | `major` | `1.4.2` → `2.0.0` |
| **Minor**: a small feature, or an enhancement of an existing one | `minor` | `1.4.2` → `1.5.0` |
| **Fix**: a bug fix | `patch` | `1.4.2` → `1.4.3` |
| **Patch**: a hotfix | `patch`, on a release branch | `1.4.2` → `1.4.3` |
| **Patch**: a channel build (dev, release candidate) | the change's own kind, in prerelease mode: `pnpm changeset pre enter dev` (or `rc`) | `1.5.0-dev.0`, `1.5.0-rc.1` |

npm versions have three numbers, so a fix and a hotfix share the third; channels live in the prerelease tag and are
published under the `dev`, `rc` and `latest` (prod) tags. Leave prerelease mode with `pnpm changeset pre exit`.

The site (`@xlibraries/web`) isn't versioned: it's the one deployable, and it pins what it ships.
