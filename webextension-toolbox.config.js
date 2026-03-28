export function webpack(config, { dev, vendor }) {
  const useModuleOutput = vendor !== 'firefox';

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
    publicPath: '/',
    environment: {
      ...config.output?.environment,
      module: useModuleOutput
    }
  };

  if (useModuleOutput) {
    config.output = {
      ...config.output,
      module: true,
      chunkFormat: 'module'
    };
  } else {
    delete config.output.module;
    delete config.output.chunkFormat;
  }

  config.experiments = {
    ...config.experiments,
    asyncWebAssembly: true
  };

  if (useModuleOutput) {
    config.experiments.outputModule = true;
  } else {
    delete config.experiments.outputModule;
  }

  if (!dev) {
    config.devtool = false;
  }

  return config;
}
