import type { NextConfig } from 'next';

const playwright = process.env.EXAMFORGE_PLAYWRIGHT === '1';
const localRun = !playwright && process.env.EXAMFORGE_LOCAL_RUN === '1';

const config: NextConfig = {
  devIndicators: false,
  distDir: playwright ? '.next-playwright' : localRun ? '.next-local' : '.next',
  // OneDrive can mark generated directories as reparse points that Next cannot unlink.
  cleanDistDir: !localRun,
};
export default config;
