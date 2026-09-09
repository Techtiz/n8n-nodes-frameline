import type { INodeProperties } from 'n8n-workflow';
import { templateLocator } from './TemplateDescription';

export const renderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['render'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Render a template to an image or PDF',
				action: 'Create a render',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List past renders in the workspace',
				action: 'Get many renders',
			},
		],
		default: 'create',
	},
];

export const renderFields: INodeProperties[] = [
	{
		...templateLocator,
		displayOptions: { show: { resource: ['render'], operation: ['create'] } },
	},

	/**
	 * The heart of the node: once a template is chosen, n8n calls
	 * `getTemplateVariables` and renders one labelled input per variable that
	 * already exists on that design, each mappable from an earlier node.
	 * Changing the template re-fetches the fields.
	 */
	{
		displayName: 'Variables',
		name: 'variables',
		type: 'resourceMapper',
		noDataExpression: true,
		default: { mappingMode: 'defineBelow', value: null },
		required: true,
		typeOptions: {
			loadOptionsDependsOn: ['templateId.value'],
			resourceMapper: {
				resourceMapperMethod: 'getTemplateVariables',
				mode: 'add',
				fieldWords: { singular: 'variable', plural: 'variables' },
				addAllFields: true,
				multiKeyMatch: false,
				supportAutoMap: true,
			},
		},
		displayOptions: { show: { resource: ['render'], operation: ['create'] } },
	},

	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		default: 'png',
		description: 'Output file format',
		options: [
			{ name: 'PNG', value: 'png' },
			{ name: 'JPEG', value: 'jpeg' },
			{ name: 'PDF', value: 'pdf' },
		],
		displayOptions: { show: { resource: ['render'], operation: ['create'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['render'], operation: ['create'] } },
		options: [
			{
				displayName: 'All Pages',
				name: 'allPages',
				type: 'boolean',
				default: false,
				description:
					'Whether to render every page of a multi-page design. For PNG and JPEG this returns one item per page; for PDF it returns a single multi-page file. Overrides Page Name or ID.',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property to write the downloaded file to',
				displayOptions: { show: { download: [true] } },
			},
			{
				displayName: 'Download File',
				name: 'download',
				type: 'boolean',
				default: false,
				description:
					'Whether to download the rendered file and attach it as binary data, in addition to returning its URL',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'Repeating a render with the same key returns the first result instead of charging a second credit. Useful when a workflow may retry.',
			},
			{
				displayName: 'Page Name or ID',
				name: 'pageId',
				type: 'options',
				default: '',
				typeOptions: { loadOptionsMethod: 'getPages', loadOptionsDependsOn: ['templateId.value'] },
				description:
					'Which page of a multi-page design to render. Defaults to the first page. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},

	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['render'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['render'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['render'], operation: ['getAll'] } },
		options: [
			{
				...templateLocator,
				required: false,
				description: 'Only return renders of this template',
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				default: 'png',
				description: 'Only return renders in this format',
				options: [
					{ name: 'PNG', value: 'png' },
					{ name: 'JPEG', value: 'jpeg' },
					{ name: 'PDF', value: 'pdf' },
				],
			},
		],
	},
];
