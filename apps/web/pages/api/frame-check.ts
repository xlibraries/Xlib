import type { NextApiRequest, NextApiResponse } from 'next';
import { checkFrame } from '@xlibraries/browser/server';
import { sendEndpoint } from '../../lib/send-endpoint';

// Brave app: can this URL be shown inside the browser window? (logic in @xlibraries/browser)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    return sendEndpoint(res, await checkFrame(url, { embedderOrigin: 'https://xlibraries.com' }));
}
