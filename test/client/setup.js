import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees and clear browser state between tests.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// happy-dom does not implement every browser API the pages touch.
if (!window.print) window.print = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
