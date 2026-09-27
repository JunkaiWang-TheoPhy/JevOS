# Generated application host

`GeneratedAppHost` is the inner, instance-bound runtime. Import the default from
`./generated` or `./generated/GeneratedAppHost`. It receives `app`, `instanceId`,
`host`, `active`, and optional `onError(message)`.

Only the host's synchronous `loadState` and `saveState` methods are used. Other
`AppHostBridge` methods are deliberately not exposed to generated code.

## Application API

```js
const initial = window.vibe.getState();
// Awaiting getState is also supported because awaiting a JSON value is valid.
await window.vibe.setState({ running: true });
const unsubscribe = window.vibe.onVisibilityChange(active => {
  // Optional application-level visibility handling.
});
```

`getState()` returns a detached JSON snapshot after initialization. `setState`
accepts an ordinary JSON object and shallow-merges it into the saved state.
It returns a Promise of the committed snapshot; await it before reading the
updated snapshot. Nested objects are replaced, not deep-merged. Persistence
failure rejects without updating the last confirmed in-memory state. A null
result from `host.loadState()` means no saved state and selects `initialState`.

The parent loads and validates state before the start handshake, and the frame
mounts the complete HTML/CSS/JS package only once after that handshake. Every
message checks the actual source window, random session nonce, instance ID,
channel, and monotonically increasing request ID. State is limited to 64 KiB,
bounded depth/traversal, and JSON values without prototype-related keys.

## Lifecycle and isolation

- The iframe has `sandbox="allow-scripts allow-forms"`, without
  `allow-same-origin`. `allow-forms` permits native local submit handlers (click,
  Enter and `requestSubmit`). A capturing listener cancels default submission;
  CSP `form-action 'none'` independently blocks actual form submission, including
  direct `HTMLFormElement.submit()` calls that bypass event handlers.
- Two intersecting CSP policies allow only nonce-bearing inline scripts. A
  script cannot reuse the nonce to load code from a remote URL. Fetch, sockets,
  workers, nested frames, external images/fonts, and form submission are blocked.
- HTML is parsed and reconstructed from allowed nodes. CSS and JavaScript are
  assigned with `textContent`, never interpolated as executable HTML fragments.
- Source identity includes instance ID, app version/source, and explicit reload.
  Layout, active-state, bridge-object, and parent render changes do not rebuild
  `srcdoc` or reload saved state. The outer window must keep its React key stable.
- Wrapped `setTimeout`, `setInterval`, and `requestAnimationFrame` pause when the
  instance is inactive or the browser document is hidden. Timeouts retain their
  remaining delay; intervals do not replay missed ticks. CSS animations pause.
- Timers are bounded to 256 resources; intervals have a 16 ms minimum delay.
  Bridge calls are bounded to 64 outstanding requests and 100 requests/second.
- Removing the iframe destroys its document and browser-owned event handlers
  and callbacks. `pagehide` additionally clears tracked resources and requests.
- Errors are displayed in the owning window and delivered via `onError`.
  Reload starts a fresh frame session with the saved instance state.

The embedding page must set an appropriate `frame-src` policy, for example
`frame-src 'self' blob:`, because an iframe's own CSP does not reliably prevent
all self-navigation. This runtime does not claim operating-system process,
CPU, or memory isolation. Synchronous infinite loops or unbounded allocation in
generated JavaScript can still affect the renderer. Web Animations created
directly through `Element.animate()` are outside the wrapped timer/CSS controls.

## Acceptance fixture and checks

`retroTimerFixture` is a checked-in acceptance fixture, visibly labelled as such;
it is not a recorded or live model generation. It provides start/pause/reset,
duration selection, deadline-based restoration, and local rendering.

```sh
node --experimental-strip-types --test tests/generated-app-host.test.mjs
npx playwright test --config src/apps/generated/playwright.config.ts
```

The dedicated browser config starts an ephemeral Vite harness inside the test,
uses its own dependency cache, and requires no backend, credentials, shared
preview process, or model calls. Its generated browser artifacts are written to
`test-results/generated-host/`.
