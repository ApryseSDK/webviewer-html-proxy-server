const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: {
      name: 'WebviewerHTMLProxyServer',
      type: 'umd',
    },
    libraryTarget: 'umd',
  },
  target: 'node',
  mode: 'development',
  externals: [nodeExternals()],
  mode: 'development',
  resolve: {
    modules: [
      "node_modules"
    ],
    extensions: [".ts", ".js"]
  }
};