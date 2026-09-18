// Build script for bundling the extension with esbuild.
// Usage:
//   node esbuild.js            -> one-off dev build
//   node esbuild.js --watch    -> rebuild on change
//   node esbuild.js --production -> minified production build (no sourcemaps)
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const problemMatcherPlugin = {
	name: 'problem-matcher',
	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			for (const error of result.errors) {
				console.error(
					`> ${error.location?.file ?? ''}:${error.location?.line ?? 0}:${error.location?.column ?? 0}: error: ${error.text}`
				);
			}
			console.log('[watch] build finished');
		});
	}
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		target: 'node18',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [problemMatcherPlugin]
	});

	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
