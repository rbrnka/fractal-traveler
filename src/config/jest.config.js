// src/config/jest.config.js
module.exports = {
    rootDir: '../../',

    setupFilesAfterEnv: ['<rootDir>/src/config/jest.setup.js'],

    moduleNameMapper: {
        '\\.(frag|vert)$': '<rootDir>/src/tests/__mocks__/fileMock.js'
    },

    testEnvironment: 'jsdom',

    roots: ['<rootDir>/src/tests'],

    transform: {
        '^.+\\.[jt]sx?$': [
            'babel-jest',
            {configFile: './src/config/babel.config.js'}
        ],
    },

    // Transform ES modules in node_modules that need it
    transformIgnorePatterns: [
        '/node_modules/(?!(.*\\.mjs$))'
    ],

    silent: true,
};