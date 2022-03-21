const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  // devtool: 'inline-source-map',
  // devtool: 'cheap-module-source-map', // works better than inline. Breakpoints actually work consistently.
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    publicPath: '/',
    library: 'WebViewerHTMLServer',
    libraryTarget: 'umd',
  },
  target: 'node',
  node: {
    // Need this when working with express, otherwise the build fails
    __dirname: false,   // if you don't put this is, __dirname
    __filename: false,  // and __filename return blank or /
  },
  externals: [nodeExternals()], // Need this to avoid error when working with Express
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: `tsconfig.json`,
              compilerOptions: {
                outDir: `types`,
                declaration: true
              }
            }
          }
        ],
      },
      {
        test: /\.m?js$/,
        exclude: [/node_modules/, /\/src\/utils/],
        use: {
          loader: "babel-loader",
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              "@babel/plugin-transform-runtime",
            ]
          }
        }
      },
      {
        test: /\.js$/,
        include: /\/src\/utils/,
        // use: 'raw-loader',
        type: 'asset/source',
      },
      {
        test: /\.css$/,
        include: /\/src\/utils/,
        use: 'css-loader',
        // // use: [MiniCssExtractPlugin.loader, "css-loader"],
        // use: [{ loader: MiniCssExtractPlugin.loader, options: { esModule: true } }, "css-loader"],
      },
    ]
  }
};
