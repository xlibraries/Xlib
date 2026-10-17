/** @type {import('next').NextConfig} */
module.exports = {
    poweredByHeader: false,
    // Static pages in public/ (drop/, privacy/) are only served at their exact file path,
    // so send the short URLs there. The page URL must end in the folder so its relative assets resolve.
    async redirects() {
        return ['drop', 'privacy'].map(page => (
            { source: `/${page}`, destination: `/${page}/index.html`, permanent: false }
        ));
    },
};
