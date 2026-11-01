import {defineConfig} from 'vitest/config';
export default defineConfig({test:{name:'@vnve/compiler',environment:'node',include:['src/**/*.test.ts']}});
