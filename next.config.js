/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
 
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: 'dist',
}
 
module.exports = nextConfig