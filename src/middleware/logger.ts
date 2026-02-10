import { Elysia } from 'elysia';

export const logger = new Elysia({ name: 'logger' })
    .onAfterHandle({ as: 'global' }, ({ request, body, headers, response, set }) => {
        const url = new URL(request.url);
        
        // Handle Elysia's custom status response objects
        const status = (response as any)?.code || set.status || 200;
        const responseData = (response as any)?.response !== undefined ? (response as any)?.response : response;

        console.log(`--- [${new Date().toISOString()}] ${request.method} ${url.pathname} ---`);
        console.log(`Status: ${status}`);
        console.log(`Auth: ${headers.authorization || 'N/A'}`);
        console.log(`Payload:`, body || 'none');
        console.log(`Response:`, responseData || 'none');
        console.log('-----------------------------------');
    })
    .onError({ as: 'global' }, ({ request, body, headers, error, set }) => {
        const url = new URL(request.url);

        console.log(`--- [${new Date().toISOString()}] ERROR ${request.method} ${url.pathname} ---`);
        console.log(`Status: ${set.status || 500}`);
        console.log(`Auth: ${headers.authorization || 'N/A'}`);
        console.log(`Payload:`, body || 'none');
        console.log(`Error: ${error.message}`);
        console.log('-----------------------------------');
    });
