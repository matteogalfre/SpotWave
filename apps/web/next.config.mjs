/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @spotwave/core ships raw TypeScript source (no build step); let Next compile
  // it as part of the app bundle.
  transpilePackages: ['@spotwave/core'],
};

export default nextConfig;
