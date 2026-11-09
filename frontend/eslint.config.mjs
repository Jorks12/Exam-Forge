import core from 'eslint-config-next/core-web-vitals';
import types from 'eslint-config-next/typescript';
const config = [...core, ...types, { ignores: ['.next*/**', 'next-env.d.ts'] }];
export default config;
