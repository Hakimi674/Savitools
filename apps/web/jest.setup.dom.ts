import { TextDecoder, TextEncoder } from 'util';

import '@testing-library/jest-dom';

// jsdom does not ship `TextEncoder`/`TextDecoder`, which the QR handoff CRC32
// relies on. Node provides them, so reuse the host implementations.
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

// jsdom does not implement `scrollIntoView`, which the command palette calls on
// the active option to keep it scrolled into view while arrowing through items.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  // Preferences and recent items are persisted in localStorage, which jsdom
  // keeps for the whole file by default. Reset it so suites stay independent.
  // Guarded because this project also runs pure-logic suites under the `node`
  // environment, where there is no window.
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});
