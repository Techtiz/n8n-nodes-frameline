const path = require('path');
const { task, src, dest } = require('gulp');

// tsc leaves non-TS assets behind, so the node/credential icons are copied
// into dist separately. n8n resolves `icon: 'file:frameline.svg'` relative to
// the compiled .js, so the svg has to land next to it.
task('build:icons', copyIcons);

function copyIcons() {
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg}');
	const nodeDestination = path.resolve('dist', 'nodes');

	src(nodeSource).pipe(dest(nodeDestination));

	const credSource = path.resolve('credentials', '**', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');

	return src(credSource, { allowEmpty: true }).pipe(dest(credDestination));
}
