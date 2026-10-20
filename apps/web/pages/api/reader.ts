import type { NextApiRequest, NextApiResponse } from 'next';
import { readArticle } from '@xlibraries/browser/server';
import { sendEndpoint } from '../../lib/send-endpoint';

// Brave app: reader view for sites that refuse to be framed (logic in @xlibraries/browser)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    return sendEndpoint(res, await readArticle(url));
}
