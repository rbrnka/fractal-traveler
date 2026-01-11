Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});

module.exports = {
    // ... your existing config
    moduleNameMapper: {
        // This tells Jest: "If you see a .frag or .vert file, just return an empty string"
        '\\.(frag|vert)$': '<rootDir>/src/tests/__mocks__/fileMock.js'
    }
};