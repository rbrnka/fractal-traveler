// jest.setup.js
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});