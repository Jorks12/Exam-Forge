import type { NextConfig } from 'next';

const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.EXAMFORGE_PLAYWRIGHT === '1' ? '.next/playwright'
    : process.env.EXAMFORGE_LOCAL_RUN === '1' ? '.next/local' : '.next',
};
export default config;
