module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // react-native-reanimated v3.16+ moved its worklets plugin out into a
      // separate package. Required for any Reanimated animation to compile.
      // MUST be listed last per Reanimated docs.
      "react-native-worklets/plugin",
    ],
  };
};
