# Automated provider refresh

The provider catalog refresh is designed for an unattended normal path and a
fail-closed exception path. It never pushes directly to `main`.

## Normal path

1. The scheduled or manually dispatched workflow refreshes provider caches.
2. `npm run check` validates code, previews, tests, and generated catalog schema.
3. A changed-file allowlist permits only the three `catalog/generated/*.json`
   artifacts.
4. A repository-scoped GitHub App creates an automation branch and pull request.
5. Pull-request CI starts automatically and repeats the scope and catalog checks.
6. GitHub-native auto-merge squash-merges the PR after every required check
   passes, then deletes the automation branch.

If any check fails, the PR remains open and `main` is unchanged. The workflow
run, bot-authored PR, diff, CI logs, and squash commit form the audit trail.

## One-time GitHub App setup

Create and install a GitHub App only for this repository. Disable webhooks and
grant these repository permissions:

- Contents: read and write
- Pull requests: read and write
- Metadata: read (required automatically by GitHub)

Add its client ID as the repository variable `REFRESH_APP_CLIENT_ID` and its
private key as the repository secret `REFRESH_APP_PRIVATE_KEY`.

Enable repository `Allow auto-merge` and `Automatically delete head branches`.
Keep the existing `main` protection: pull requests required, zero human
approvals, strict `test` status check, conversation resolution, linear history,
and no force pushes or deletion.

## Security boundaries

- The App is installed only on this repository and receives only the two write
  permissions needed to push automation branches and manage pull requests.
- Installation tokens expire after one hour and are revoked when the workflow
  job ends.
- Auto-merge cannot bypass required status checks.
- Automation PRs may modify only the normalized generated catalog artifacts.
- Upstream repositories are scanned as data; their test fixtures are not run by
  this project's test command.
