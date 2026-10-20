import type { NextApiRequest, NextApiResponse } from 'next';
import { HIDEABLE_APPS } from '../../lib/app-ids';
import { getStore } from '../../lib/kv';
import { readSettings } from '../../lib/site-settings';

// Public: the live site settings every desktop reads (cached briefly at the edge)
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    return res.status(200).json(await readSettings(getStore(), HIDEABLE_APPS));
}
