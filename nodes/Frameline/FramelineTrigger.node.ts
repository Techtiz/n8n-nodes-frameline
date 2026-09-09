import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import {
	framelineApiRequest,
	type FramelinePage,
	type FramelineRender,
	type FramelineTemplate,
} from './GenericFunctions';
import { templateLocator } from './descriptions/TemplateDescription';

interface TriggerState {
	lastCreatedAt?: string;
	seenIds?: string[];
}

export class FramelineTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Frameline Trigger',
		name: 'framelineTrigger',
		icon: { light: 'file:frameline.svg', dark: 'file:frameline.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"New render"}}',
		description: 'Starts a workflow when a new render is created in Frameline',
		defaults: { name: 'Frameline Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'framelineApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'New Render',
						value: 'renderCreated',
						description: 'A new render was created in the workspace, from any source',
					},
				],
				default: 'renderCreated',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				options: [
					{
						...templateLocator,
						required: false,
						description: 'Only fire for renders of this template',
					},
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						default: 'png',
						description: 'Only fire for renders in this format',
						options: [
							{ name: 'PNG', value: 'png' },
							{ name: 'JPEG', value: 'jpeg' },
							{ name: 'PDF', value: 'pdf' },
						],
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
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
	};

	/**
	 * The API has no render webhook, so this polls `/v1/renders` (newest first)
	 * and keeps a `createdAt` cursor in workflow static data.
	 *
	 * Timestamps are not unique — several renders can share a second — so the
	 * ids seen at the cursor timestamp are stored alongside it and used to
	 * suppress duplicates on the next poll.
	 */
	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const state = this.getWorkflowStaticData('node') as TriggerState;
		const manualMode = this.getMode() === 'manual';

		const filters = this.getNodeParameter('filters', {}) as IDataObject;
		const qs: IDataObject = { page: 1, limit: manualMode ? 1 : 100 };

		if (filters.format) qs.format = filters.format;
		if (filters.templateId) {
			const locator = filters.templateId as { value?: string } | string;
			const value = typeof locator === 'string' ? locator : locator?.value;
			if (value) qs.templateId = value;
		}

		const response = await framelineApiRequest<FramelinePage<FramelineRender>>(
			this,
			'GET',
			'/v1/renders',
			{},
			qs,
		);

		const renders = response.items ?? [];

		// "Fetch Test Event" should show one sample without consuming the cursor.
		if (manualMode) {
			if (!renders.length) return null;
			return [renders.slice(0, 1).map((render) => ({ json: render as unknown as IDataObject }))];
		}

		const cursor = state.lastCreatedAt;
		const seenIds = new Set(state.seenIds ?? []);

		// First activation: remember where we are, emit nothing. Otherwise the
		// workflow would fire once for every render in the workspace's history.
		if (!cursor) {
			const newest = renders[0];
			if (newest) {
				state.lastCreatedAt = newest.createdAt;
				state.seenIds = renders
					.filter((render) => render.createdAt === newest.createdAt)
					.map((render) => render.id);
			}
			return null;
		}

		const fresh = renders.filter((render) => render.createdAt >= cursor && !seenIds.has(render.id));

		if (!fresh.length) return null;

		// The API returns newest first; a workflow reads better oldest first.
		fresh.reverse();

		const newestCreatedAt = fresh[fresh.length - 1].createdAt;
		state.lastCreatedAt = newestCreatedAt;
		state.seenIds = [...renders, ...fresh]
			.filter((render) => render.createdAt === newestCreatedAt)
			.map((render) => render.id);

		return [fresh.map((render) => ({ json: render as unknown as IDataObject }))];
	}
}
