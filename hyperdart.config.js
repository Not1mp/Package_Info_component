import pkg from './package.json' with {type:'json'}

export default  {
	// Import the package name from package.json; platform identity stays template-managed.
	name: pkg.name,
	triggers: {
		keywords: ['npm', 'package info', 'npm package', 'compare packages', 'packages like', 'alternatives to'],
		// Keep package-name matching on the NPM_PACKAGES collection.
	},
	query_format: {
		regex: [
			'(npm( packages?)?|package info) HD_PACKAGES.NPM_PACKAGES',
			'(latest|current|newest) version of HD_PACKAGES.NPM_PACKAGES',
			'compare( npm)?( packages?)? HD_PACKAGES.NPM_PACKAGES(,| vs| versus| and) HD_PACKAGES.NPM_PACKAGES((,| vs| versus| and) HD_PACKAGES.NPM_PACKAGES)?',
			'(npm )?(alternatives?( to| for)|packages? (like|similar to)) HD_PACKAGES.NPM_PACKAGES( npm)?',
			'(best|recommend) (npm )?(packages?|libraries) for',
			'(npm )?(packages?|library) for'
		],
		fallBackRegex: [
			'compare( npm)?( packages?)? (?<HD_PACKAGES>.+)'
		]
	},
	client: {
		// Keep the bundle location and module name derived from package.json.
		location: pkg.module,
		moduleName: pkg.umdName || 'HD' + pkg.name,
		baseURL: '/' + pkg.name,
	},
	format: {
		mainline: true,
		sidebar: true
	},
	permissions: {},
	info: {
		description: 'Live npm package details, comparisons, and related package discovery.'
	},
	github: '',
	demovideo: ''
}

