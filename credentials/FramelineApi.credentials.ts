import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FramelineApi implements ICredentialType {
	name = 'framelineApi';

	displayName = 'Frameline API';

	documentationUrl = 'https://frameline.io/documentation/api-reference/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Workspace API key, starting with <code>fl_live_</code>. Create one in the Frameline dashboard under Settings → API Keys, with both the <code>template:read</code> and <code>render:write</code> scopes. The key is shown only once.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://frameline-backend-production.up.railway.app',
			description:
				'The Frameline API origin. Only change this to point at a self-hosted or staging instance. No trailing slash.',
		},
	];

	// The key is a bearer token; the API also accepts X-Api-Key, but Bearer is
	// the documented default.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// /v1/me is the cheapest authenticated read and returns the workspace and
	// the key's scopes, so a wrong or revoked key fails here with the API's own
	// INVALID_API_KEY message rather than at the first real request.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(new RegExp("/$"), "")}}',
			url: '/v1/me',
			method: 'GET',
		},
	};
}
