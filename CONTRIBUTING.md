# Contributing

This guide covers pull requests and how releases of `esp-web-tools` are built and published.

## Development

Requirements: Node.js 22 or newer.

```sh
npm ci
script/develop
```

Before opening a pull request, run the same checks as CI:

```sh
script/build
script/build_website
npm exec -- prettier --check src
```

### Changing GitHub workflows

Actions are referenced by version tag and pinned in `.github/workflows/actions.lock`. After adding or changing any `uses:`, regenerate the lockfile and commit it with the workflow change:

```sh
gh extension install github/gh-actions-lock
gh actions-lock
```

The `Actions lockfile / Verify` check fails if the lockfile is out of date.

## Pull requests

The labels on merged pull requests decide the next version number:

| Label             | Version bump    |
| ----------------- | --------------- |
| `breaking change` | Major (`x.0.0`) |
| `new-feature`     | Minor (`0.x.0`) |
| Anything else     | Patch (`0.0.x`) |

The highest bump among the pull requests merged since the last release wins. Label pull requests before merging; changing the version on the draft release by hand breaks the build (see below).

## Releasing

Releases are cut from GitHub draft releases. The package is built once, attached to the draft, and that exact tarball is published to npm. Nothing is rebuilt at publish time.

### How it works

1. **Merge to `main`.** The `Draft release / Update draft` workflow:
   - updates the draft release notes and resolves the next version from the labels above,
   - runs `npm version` and commits the bump to `main` as the ESPHome GitHub App,
   - pins the draft to that commit,
   - removes any tarball left on the draft by an earlier build,
   - adds a "Do not publish this release yet" warning to the top of the draft.
2. **Build.** When that finishes, `Build release` runs three jobs. `Find draft` checks that the draft is pinned to a commit on `main`. `Build` checks out that commit, checks that `package.json` matches the draft's tag and builds `esp-web-tools-<version>.tgz` with no token or secrets. `Attach to draft` then attaches the tarball to the draft and removes the warning.
3. **Publish the draft.** When the warning is gone and the tarball is attached, review the notes and publish the release on GitHub.
4. **npm.** `Publish / npm` runs in the `npm` environment. It downloads the tarball from the release, verifies it against the immutable release attestation, checks its version, and publishes it to npm with provenance via trusted publishing (no npm token).

### Rules

- **Do not publish while the warning is on the draft.** Releases are immutable: a release published before its tarball is attached cannot be fixed. `Publish / npm` will fail without touching npm, and the only way forward is to merge another change and release the next version.
- **Do not edit the draft's tag or version by hand.** The version is committed to `package.json` before the build, and `Build release` fails if the tag no longer matches. Use labels to control the bump instead.
- **To rebuild a draft,** run `Build release` manually from the Actions tab (it has a `workflow_dispatch` trigger).

### One-time setup

Check these if a release workflow fails on permissions:

- **GitHub App:** the `ESPHOME_GITHUB_APP_CLIENT_ID` repository variable and `ESPHOME_GITHUB_APP_PRIVATE_KEY` secret. The app's installation needs Contents (read and write), Pull requests (read), and Attestations (read).
- **Immutable releases:** enabled in the repository settings. `Publish / npm` verifies the release attestation and fails without it.
- **npm trusted publisher:** on npmjs.com, `esp-web-tools` trusts repository `esphome/esp-web-tools`, workflow `npmpublish.yml`, environment `npm`.
