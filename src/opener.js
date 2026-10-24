// The ONE "open this in the OS" helper: `xdg-open` (linux) / `open` (macOS), argv array, no shell, detached.
// Settings' "Open keys folder" and the `bareloop start` launcher both use it. Another OS or a failed spawn
// resolves `false` (the caller then shows the path/URL as text); it never throws.
import { spawn as realSpawn } from 'node:child_process';

/**
 * @param {string} target a folder path or a URL
 * @param {{ platform?: string, spawnFn?: ((cmd: string, args: string[], o: object) => any)|null, underTest?: boolean }} [opts]
 *   `spawnFn: null` = no opener at all (resolves false); undefined = the real spawn, unless `underTest`, which spawns nothing
 *   unless a test injected one
 * @returns {Promise<boolean>} true once the opener process has started
 */
export function openInOs(target, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const cmd = platform === 'linux' ? 'xdg-open' : (platform === 'darwin' ? 'open' : null);
  const opener = opts.spawnFn === undefined ? (opts.underTest ? null : realSpawn) : opts.spawnFn;
  if (!cmd || !opener) return Promise.resolve(false);
  return new Promise((resolve) => {
    let child;
    try { child = opener(cmd, [target], { detached: true, stdio: 'ignore' }); } catch { resolve(false); return; }
    let settled = false;
    child.once('error', () => { if (!settled) { settled = true; resolve(false); } });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      if (typeof child.unref === 'function') child.unref();
      resolve(true);
    });
  });
}
