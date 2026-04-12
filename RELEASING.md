# Releasing `cursor-buddy`

This repo is set up so you can release from the repo root.

## First publish: `0.0.1`

1. Log in to npm once on this machine:

   ```bash
   npm login
   ```

2. From the repo root, verify the package contents:

   ```bash
   pnpm release:check
   ```

3. Publish `packages/cursor-buddy`:

   ```bash
   pnpm release:publish
   ```

If npm account 2FA is enabled for publishing, `npm publish` will prompt for the OTP.

## Next releases

Choose the next version bump from the repo root:

```bash
pnpm release:patch
# or
pnpm release:minor
# or
pnpm release:major
```

Then publish:

```bash
pnpm release:publish
```

`npm version` creates the git tag automatically. After publishing, push the commit and tags:

```bash
git push --follow-tags
```

## What the scripts do

- `pnpm release:check`
  - Runs TypeScript checks
  - Builds the package through `prepack`
  - Shows the exact tarball contents with `npm pack --dry-run`

- `pnpm release:publish`
  - Re-runs the checks
  - Publishes `packages/cursor-buddy` to npm

- `pnpm release:patch|minor|major`
  - Bumps the version in `packages/cursor-buddy/package.json`
  - Creates a matching git commit and tag
