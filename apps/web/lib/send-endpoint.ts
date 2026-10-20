import type { NextApiResponse } from 'next';
import type { EndpointResult } from '@xlibraries/browser/server';

// Sends a framework-agnostic endpoint result (status, JSON body, cache header) as a Next.js API response
export function sendEndpoint(res: NextApiResponse, result: EndpointResult) {
    if (result.cacheControl) res.setHeader('Cache-Control', result.cacheControl);
    return res.status(result.status).json(result.body);
}
