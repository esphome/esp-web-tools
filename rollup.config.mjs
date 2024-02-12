import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";

const config = {
  input: "dist/install-button.js",
  output: {
    dir: "dist/web",
    format: "module",
  },
  external: ["https://www.improv-wifi.com/sdk-js/launch-button.js"],
  preserveEntrySignatures: false,
  plugins: [
    commonjs(),
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    babel({
      babelHelpers: "bundled",
      plugins: [
        "@babel/plugin-proposal-class-properties",
        "@babel/plugin-transform-logical-assignment-operators",
      ],
    }),
    json(),
  ],
};

if (process.env.NODE_ENV === "production") {
  config.plugins.push(
    terser({
      ecma: 2019,
      toplevel: true,
      format: {
        comments: false,
      },
    })
  );
}

export default config;
