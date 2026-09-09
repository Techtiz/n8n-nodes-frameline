# n8n-nodes-frameline

An [n8n](https://n8n.io) community node for [Frameline](https://frameline.io) —
render design templates to PNG, JPEG or PDF from inside a workflow.

Pick a template from a dropdown and the variables that exist on that design
appear as input fields, ready to map from an earlier node.

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter
`n8n-nodes-frameline`, and confirm.

For a manual install on a self-hosted instance:

```bash
cd ~/.n8n/custom
npm install n8n-nodes-frameline
```

Restart n8n afterwards.

## Credentials

Create a workspace API key in the Frameline dashboard under **Settings → API
Keys**, granting both scopes:

| Scope | Needed for |
|---|---|
| `template:read` | listing templates, reading their variables |
| `render:write` | creating renders, reading render history |

The raw key is shown once, at creation. Copy it then.

In n8n, add a **Frameline API** credential and paste the key. Leave the base URL at its default unless you are pointing at a self-hosted
or staging instance. Press **Test** to confirm — it calls `/v1/me`.

A key is bound to one workspace, and revoking it takes effect immediately.

## Node: Frameline

### Render → Create

The main action. Select a template, fill in its variables, choose a format.

- **Template** — pick from a searchable list of your workspace's templates, or
  paste a template ID.
- **Variables** — populated from the chosen design. Each `variableName`-bound
  layer becomes one field: text layers take a string, image layers a publicly
  reachable image URL, colour layers a CSS colour such as `#FF0055`. Leave a
  field empty to keep whatever the design already has.
- **Format** — PNG (default), JPEG or PDF.
- **Options**
  - *All Pages* — render every page. PNG and JPEG return one item per page; PDF
    returns a single multi-page file. Takes precedence over Page.
  - *Page* — render one page of a multi-page design. Defaults to the first.
  - *Download File* — also fetch the rendered file and attach it as binary data,
    so it can be emailed or uploaded downstream.
  - *Idempotency Key* — repeating a render with the same key returns the first
    result instead of charging another credit. Useful if a workflow may retry.

Output is the render's metadata, including a stored `url`:

```json
{
  "id": "ren_1vw0xb7zbewm",
  "templateId": "tpl_8bqzctmhzag3",
  "format": "png",
  "url": "https://…/renders/d53eb338….png",
  "byteSize": 9119,
  "width": 800,
  "height": 600,
  "createdAt": "2026-09-09T09:59:47.814Z",
  "credits": { "charged": 1, "balanceAfter": 99998 }
}
```

Renders are content-addressed: rendering identical bytes again returns the
existing file and charges nothing.

### Render → Get Many

Workspace render history, newest first. Filter by template or format.

### Template → Get Many · Get · Get Variables

Read-only lookups. **Get Variables** returns one item per variable, with its
key, type, label and current value — useful for building a dynamic workflow.

## Node: Frameline Trigger

Starts a workflow when a **new render** appears in the workspace, from any
source — the API, the studio, or another integration. Optionally filtered by
template or format.

It polls on the schedule you set. The first activation records where the history
stands without firing, so an existing backlog does not flood the workflow.

## Renders draw on plan credits

Each new render costs one credit against the workspace's plan. When the plan is
exhausted the node fails with a "payment required" error naming the limit.

## Compatibility

Tested against n8n's current node API (`n8nNodesApiVersion: 1`) on Node.js 20+.

## Development

```bash
npm install --legacy-peer-deps --ignore-scripts
npm run build      # tsc + copy icons into dist
npm run lint       # n8n community-node linter
npm link           # then `npm link n8n-nodes-frameline` in ~/.n8n/custom
```

`--ignore-scripts` skips a native module (`isolated-vm`) that arrives
transitively through the `n8n-workflow` dev dependency. Nothing at runtime
uses it, and it fails to compile on newer Node versions.

## Releasing

Publishing happens in CI so the package carries an npm provenance statement,
which n8n requires for verified community nodes. Publishing from a laptop
produces no attestation.

1. Bump `version` in `package.json` and merge to `main`.
2. Create a GitHub release, or run the **Publish to npm** workflow manually.

The workflow needs an `NPM_TOKEN` repository secret (an npm **automation**
token).

## License

MIT
