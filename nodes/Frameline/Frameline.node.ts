import type {
	IDataObject,
	JsonObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	describeParameter,
	framelineApiRequest,
	framelineApiRequestList,
	getTemplateParameters,
	type FramelinePage,
	type FramelineRender,
	type FramelineTemplate,
} from './GenericFunctions';
import { templateFields, templateOperations } from './descriptions/TemplateDescription';
import { renderFields, renderOperations } from './descriptions/RenderDescription';

/** A render of a multi-page design comes back as `{ pages: [...] }`. */
interface RenderResponse extends Partial<FramelineRender> {
	pages?: FramelineRender[];
}

export class Frameline implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Frameline',
		name: 'frameline',
		icon: { light: 'file:frameline.svg', dark: 'file:frameline.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Render Frameline design templates to PNG, JPEG or PDF',
		defaults: { name: 'Frameline' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'framelineApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Render', value: 'render' },
					{ name: 'Template', value: 'template' },
				],
				default: 'render',
			},
			...renderOperations,
			...renderFields,
			...templateOperations,
			...templateFields,
		],
	};

	methods = {
		listSearch: {
			/** Backs the template dropdown, server-side filtered as the user types. */
			async searchTemplates(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const qs: IDataObject = { limit: 100, page: 1 };
				if (filter) qs.search = filter;

				const response = await framelineApiRequest<FramelinePage<FramelineTemplate>>(
					this,
					'GET',
					'/v1/templates',
					{},
					qs,
				);

				return {
					results: (response.items ?? []).map((template) => ({
						name: template.name || template.id,
						value: template.id,
						url: template.thumbnailUrl ?? undefined,
					})),
				};
			},
		},

		loadOptions: {
			/** Page picker for multi-page designs. */
			async getPages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const templateId = this.getNodeParameter('templateId', undefined, {
					extractValue: true,
				}) as string;

				if (!templateId) return [];

				const { pages } = await getTemplateParameters(this, templateId);

				return (pages ?? []).map((page, index) => ({
					name: page.name || `Page ${index + 1}`,
					value: page.id,
				}));
			},
		},

		resourceMapping: {
			/**
			 * Turns the template's existing variables into input fields.
			 *
			 * Text, image and color layers are all strings over the API — the
			 * difference is only what a valid value looks like, so that goes in
			 * each field's description rather than into a type n8n would then
			 * try to coerce.
			 */
			async getTemplateVariables(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const templateId = this.getNodeParameter('templateId', undefined, {
					extractValue: true,
				}) as string;

				if (!templateId) return { fields: [] };

				const { parameters } = await getTemplateParameters(this, templateId);

				const fields: ResourceMapperField[] = (parameters ?? []).map((parameter) => ({
					id: parameter.key,
					displayName: parameter.label || parameter.key,
					required: parameter.required,
					defaultMatch: false,
					canBeUsedToMatch: false,
					display: true,
					type: 'string',
					// The layer's current value is only a hint; leaving a field
					// empty keeps whatever the design already has.
					display_name: parameter.label || parameter.key,
					description: describeParameter(parameter),
				})) as ResourceMapperField[];

				return { fields };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'render' && operation === 'create') {
					const templateId = this.getNodeParameter('templateId', i, undefined, {
						extractValue: true,
					}) as string;
					const format = this.getNodeParameter('format', i) as string;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;

					const mapper = this.getNodeParameter('variables', i, {}) as {
						value?: IDataObject | null;
					};

					// An untouched field is an empty string; sending it would blank
					// the layer, so only non-empty values become modifications.
					const modifications: IDataObject = {};
					for (const [key, value] of Object.entries(mapper?.value ?? {})) {
						if (value === undefined || value === null || value === '') continue;
						modifications[key] = String(value);
					}

					const body: IDataObject = { format };
					if (Object.keys(modifications).length) body.modifications = modifications;
					if (options.allPages) body.allPages = true;
					else if (options.pageId) body.pageId = options.pageId;
					if (options.idempotencyKey) body.idempotencyKey = options.idempotencyKey;

					const response = await framelineApiRequest<RenderResponse>(
						this,
						'POST',
						`/v1/templates/${encodeURIComponent(templateId)}/render`,
						body,
					);

					// allPages + png/jpeg returns one object per page; everything
					// else returns a single render.
					const renders: FramelineRender[] = Array.isArray(response.pages)
						? response.pages
						: [response as FramelineRender];

					for (const render of renders) {
						const entry: INodeExecutionData = {
							json: render as unknown as IDataObject,
							pairedItem: { item: i },
						};

						if (options.download) {
							const binaryPropertyName = (options.binaryPropertyName as string) || 'data';
							const file = await this.helpers.httpRequest({
								method: 'GET',
								url: render.url,
								encoding: 'arraybuffer',
								json: false,
							});

							entry.binary = {
								[binaryPropertyName]: await this.helpers.prepareBinaryData(
									Buffer.from(file as ArrayBuffer),
									`${render.id}.${render.format}`,
								),
							};
						}

						returnData.push(entry);
					}

					continue;
				}

				if (resource === 'render' && operation === 'getAll') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const qs: IDataObject = {};

					if (filters.format) qs.format = filters.format;
					if (filters.templateId) {
						const locator = filters.templateId as { value?: string } | string;
						const value = typeof locator === 'string' ? locator : locator?.value;
						if (value) qs.templateId = value;
					}

					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? 0 : (this.getNodeParameter('limit', i) as number);

					const renders = await framelineApiRequestList<FramelineRender>(
						this,
						'/v1/renders',
						qs,
						returnAll,
						limit,
					);

					returnData.push(
						...renders.map((render) => ({
							json: render as unknown as IDataObject,
							pairedItem: { item: i },
						})),
					);

					continue;
				}

				if (resource === 'template' && operation === 'getAll') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const qs: IDataObject = {};

					if (filters.search) qs.search = filters.search;
					if (filters.tags) {
						const tags = String(filters.tags)
							.split(',')
							.map((tag) => tag.trim())
							.filter(Boolean);
						if (tags.length) qs.tags = tags;
					}

					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? 0 : (this.getNodeParameter('limit', i) as number);

					const templates = await framelineApiRequestList<FramelineTemplate>(
						this,
						'/v1/templates',
						qs,
						returnAll,
						limit,
					);

					returnData.push(
						...templates.map((template) => ({
							json: template as unknown as IDataObject,
							pairedItem: { item: i },
						})),
					);

					continue;
				}

				if (resource === 'template' && operation === 'get') {
					const templateId = this.getNodeParameter('templateId', i, undefined, {
						extractValue: true,
					}) as string;

					const template = await framelineApiRequest<FramelineTemplate>(
						this,
						'GET',
						`/v1/templates/${encodeURIComponent(templateId)}`,
					);

					returnData.push({
						json: template as unknown as IDataObject,
						pairedItem: { item: i },
					});

					continue;
				}

				if (resource === 'template' && operation === 'getVariables') {
					const templateId = this.getNodeParameter('templateId', i, undefined, {
						extractValue: true,
					}) as string;

					const { parameters } = await getTemplateParameters(this, templateId);

					returnData.push(
						...(parameters ?? []).map((parameter) => ({
							json: parameter as unknown as IDataObject,
							pairedItem: { item: i },
						})),
					);

					continue;
				}

				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported for resource "${resource}"`,
					{ itemIndex: i },
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				// framelineApiRequest already raises NodeApiError; anything else
				// reaching here is a raw throw, so wrap it before it leaves the
				// node. Either way what propagates is an n8n error type.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
