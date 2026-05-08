/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Work around intermittent missing chunk/cache corruption issues on Windows dev servers.
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
