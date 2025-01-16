document.body.innerHTML = `
  <canvas id="fractalCanvas"></canvas>
  <div id="headerContainer"></div>
  <div id="infoText"></div>
  <button id="reset">Reset</button>
  <button id="randomize">Randomize Colors</button>
  <button id="preset1">Preset 1</button>
`;

// jest.setup.js
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});

if (typeof Touch === 'undefined') {
    global.Touch = class Touch {
        constructor({ identifier, target, clientX, clientY }) {
            this.identifier = identifier;
            this.target = target;
            this.clientX = clientX;
            this.clientY = clientY;
            // You can add other properties as needed.
        }
    };
}