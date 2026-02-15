import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes("--watch");

/** sql.js の WASM ファイルを out/ にコピー */
function copySqlWasm() {
  const src = resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.wasm");
  const destDir = resolve(__dirname, "out");
  const dest = resolve(destDir, "sql-wasm.wasm");

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  if (!existsSync(src)) {
    console.error(
      "Warning: sql-wasm.wasm not found. Run 'npm install' first."
    );
    return;
  }

  copyFileSync(src, dest);
  console.log("Copied sql-wasm.wasm to out/");
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode", "sql.js"],
  format: "cjs",
  platform: "node",
  target: "ES2022",
  sourcemap: true,
  minify: false,
};

async function main() {
  copySqlWasm();

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log("Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
