import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  //const nextConfig = {
  /* config options here */
  devIndicators: {
    appIsrStatus: false,
  },
  images: {
    domains: ["til8tmqclrhrb7ie.public.blob.vercel-storage.com"],
  },
  async rewrites() {
    return [
      {
        source: "/work",
        destination: "/",
      },
      {
        source: "/work/:slug",
        destination: "/",
      },
      {
        source: "/resume",
        destination: "/",
      },
      {
        source: "/contact",
        destination: "/",
      },
    ];
  },
  webpack: (config, options) => {
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ["raw-loader", "glslify-loader"],
    });
    if (options.isServer) {
      config.resolve.alias["paper"] = false;
    }

    return config;
  },
};

export default nextConfig;
