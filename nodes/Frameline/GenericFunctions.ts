import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type FramelineContext =
	IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions | IHookFunctions;

/** Every Frameline response is wrapped `{ success, data }`. */
interface FramelineEnvelope {
	success?: boolean;
	data?: unknown;
}

/** Shape of the paginated list endpoints (`/v1/templates`, `/v1/renders`). */
export interface FramelinePage<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
}

export interface FramelineTemplate {
	id: string;
	name: string;
	description: string | null;
	tags: string[];
	pageCount: number;
	width: number;
	height: number;
	thumbnailUrl: string | null;
	updatedAt: string;
}

export interface FramelineParameter {
	key: string;
	type: 'text' | 'image' | 'color';
	sampleValue: string | null;
	label: string | null;
	description: string | null;
	defaultValue: string | null;
	required: boolean;
	pages: string[];
}

export interface FramelineParameters {
	pages: Array<{ id: string; name: string }>;
	parameters: FramelineParameter[];
}

export interface FramelineRender {
	id: string;
	templateId: string;
	templateName?: string;
	format: string;
	url: string;
	byteSize: number;
	width: number;
	height: number;
	createdAt: string;
}

/**
 * One request against the machine surface, returning the unwrapped `data`.
 *
 * Credentials carry the base URL and the bearer header, so this only has to
 * strip the envelope and turn a Frameline error body into a NodeApiError that
 * shows the API's own `code`/`message` in the n8n UI. A bad key is a 403 here
 * (Orshot parity), not a 401 — the message makes that legible.
 */
export async function framelineApiRequest<T = IDataObject>(
	context: FramelineContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<T> {
	const credentials = await context.getCredentials('framelineApi');
	const baseUrl = (
		(credentials.baseUrl as string) || 'https://frameline-backend-production.up.railway.app'
	).replace(/\/$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		headers: { 'Content-Type': 'application/json' },
		qs,
		body,
	};

	if (Object.keys(body).length === 0) delete options.body;
	if (Object.keys(qs).length === 0) delete options.qs;

	try {
		const response = (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'framelineApi',
			options,
		)) as FramelineEnvelope;

		// Defensive: an endpoint that ever returns a bare payload still works.
		if (response !== null && typeof response === 'object' && 'data' in response) {
			return response.data as T;
		}

		return response as T;
	} catch (error) {
		throw new NodeApiError(context.getNode(), error as never);
	}
}

/**
 * Walks a paginated list endpoint to exhaustion.
 *
 * `total` is authoritative, but a page that comes back short (or empty) also
 * stops the walk so a shrinking collection mid-pagination cannot loop forever.
 */
export async function framelineApiRequestAllItems<T>(
	context: FramelineContext,
	endpoint: string,
	qs: IDataObject = {},
): Promise<T[]> {
	const limit = 100;
	const items: T[] = [];
	let page = 1;

	for (;;) {
		const response = await framelineApiRequest<FramelinePage<T>>(
			context,
			'GET',
			endpoint,
			{},
			{ ...qs, page, limit },
		);

		const batch = response?.items ?? [];
		items.push(...batch);

		if (batch.length < limit) break;
		if (typeof response.total === 'number' && items.length >= response.total) break;

		page += 1;
	}

	return items;
}

/**
 * Reads a list endpoint honouring n8n's Return All / Limit pair.
 *
 * With Return All off, one page of at most `limit` is enough — the API caps a
 * page at 100, so a larger limit still has to paginate.
 */
export async function framelineApiRequestList<T>(
	context: FramelineContext,
	endpoint: string,
	qs: IDataObject,
	returnAll: boolean,
	limit: number,
): Promise<T[]> {
	if (returnAll) {
		return framelineApiRequestAllItems<T>(context, endpoint, qs);
	}

	if (limit > 100) {
		const all = await framelineApiRequestAllItems<T>(context, endpoint, qs);
		return all.slice(0, limit);
	}

	const response = await framelineApiRequest<FramelinePage<T>>(
		context,
		'GET',
		endpoint,
		{},
		{
			...qs,
			page: 1,
			limit,
		},
	);

	return (response.items ?? []).slice(0, limit);
}

/**
 * Fetches a template's variables.
 *
 * Shared by the resource mapper (which turns them into input fields), the page
 * dropdown and the Get Variables operation.
 */
export async function getTemplateParameters(
	context: FramelineContext,
	templateId: string,
): Promise<FramelineParameters> {
	return framelineApiRequest<FramelineParameters>(
		context,
		'GET',
		`/v1/templates/${encodeURIComponent(templateId)}/parameters`,
	);
}

/** Placeholder text for a variable input, based on what the layer holds today. */
export function describeParameter(parameter: FramelineParameter): string {
	const hints: Record<FramelineParameter['type'], string> = {
		text: 'Text value for this layer',
		image: 'Publicly reachable image URL',
		color: 'CSS color, e.g. #FF0055',
	};

	const parts = [hints[parameter.type] ?? hints.text];

	if (parameter.description) parts.push(parameter.description);
	if (parameter.defaultValue) parts.push(`Current value: ${parameter.defaultValue}`);

	return parts.join('. ');
}
