import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security-headers';

const PRIMARY_HOST = 'xlibraries.com';
const ALIAS_HOSTS = ['www.xlibraries.com', 'xlibraries.club', 'www.xlibraries.club'];

const config: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders({ dev: process.env.NODE_ENV !== 'production' }) }];
    },
    async redirects() {
        return [
            // One canonical domain: every alias permanently redirects to xlibraries.com, keeping the path
            ...ALIAS_HOSTS.map(host => ({
                source: '/:path*',
                has: [{ type: 'host', value: host }],
                destination: `https://${PRIMARY_HOST}/:path*`,
                permanent: true,
            })),
            // Static pages in public/ (drop/, privacy/) are only served at their exact file path,
            // so send the short URLs there. The page URL must end in the folder so its relative assets resolve.
            ...['drop', 'privacy'].map(page => (
                { source: `/${page}`, destination: `/${page}/index.html`, permanent: false }
            )),
        ];
    },
};

export default config;
