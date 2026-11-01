// Where the site serves a package's native modules (its dist/<module>/, copied by scripts/vendor.mjs, which says the
// same): /native/<name without @xlibraries/>@<version>. Versioned, so a new build never meets an old one in a cache.
export const nativeBase = ({ name, version }: { name: string; version: string }) => `/native/${name.replace(/^@xlibraries\//, '')}@${version}`;
