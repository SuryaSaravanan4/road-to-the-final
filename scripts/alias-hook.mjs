import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Teaches plain `node` the "@/*" -> "src/*" alias from tsconfig.json, so
 * scripts/ can import application modules the same way the app does. Next.js
 * and Vitest each resolve the alias themselves; node does not.
 *
 * Node 24 strips TypeScript types natively, so no transpiler is involved —
 * this only rewrites the specifier and appends the extension the alias omits.
 */
const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

    const target = path.join(srcDir, specifier.slice(2));
    const resolved = path.extname(target) ? target : `${target}.ts`;
    return nextResolve(pathToFileURL(resolved).href, context);
  },
});
