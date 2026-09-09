import type { INodeProperties } from 'n8n-workflow';

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a single template',
				action: 'Get a template',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List templates in the workspace',
				action: 'Get many templates',
			},
			{
				name: 'Get Variables',
				value: 'getVariables',
				description: "List a template's variables and their current values",
				action: 'Get variables of a template',
			},
		],
		default: 'getAll',
	},
];

/** Reused by every operation that names a template, including the trigger. */
export const templateLocator: INodeProperties = {
	displayName: 'Template',
	name: 'templateId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The design template to use',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a template…',
			typeOptions: {
				searchListMethod: 'searchTemplates',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'tpl_1234567890',
		},
	],
};

export const templateFields: INodeProperties[] = [
	{
		...templateLocator,
		displayOptions: {
			show: { resource: ['template'], operation: ['get', 'getVariables'] },
		},
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['template'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: "Match against the template's name, description and tags",
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'social,launch',
				description: 'Comma-separated list of tags. Max 10.',
			},
		],
	},
];
