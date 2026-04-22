import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "tsconfig.tsbuildinfo"],
  },
  ...nextCoreWebVitals,
];

export default config;
