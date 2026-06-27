// self-host shim: graceful-degradation replacement for the license-gated module. Replace with the real licensed module if available.

// Window CustomEvent name dispatched by the request-list trigger button and
// listened for by the dataroom nav. Matches the consumer's add/removeEventListener.
export const VIEWER_TOGGLE_REQUEST_LIST_EVENT = "viewer:toggle-request-list";
