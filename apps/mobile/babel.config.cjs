// tsconfig.json declares the `@/*` path aliases for the TypeScript
// checker, but that's type-checking only — Metro (the actual bundler) has
// no idea about them without this. Without this file, every `@/...` import
// (App.tsx and 6 files under src/) fails to resolve at runtime with
// "Unable to resolve module @/...", even though `tsc` reports no errors.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
  };
};
