module.exports = {
  webpack: (config, { dev, vendor }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react': 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime'
    };

    if (!config.module.rules.some(rule => rule.test && rule.test.toString().includes('css'))) {
      config.module.rules.push({
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      });
    }

    config.output = {
      ...config.output,
      module: true,
      chunkFormat: 'module'
    };

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      outputModule: true
    };

    return config;
  },
};
