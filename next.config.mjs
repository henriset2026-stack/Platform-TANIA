/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fail the production build on type errors rather than shipping them.
  // (Next 16 removed the `eslint` config key; linting runs via `npm run lint`.)
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
