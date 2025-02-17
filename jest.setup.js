// Extend Jest's expect with additional matchers from jest-dom (if you're using it)
// import '@testing-library/jest-dom/extend-expect';

// Optionally, mock the clipboard API if your tests rely on it.
// if (!navigator.clipboard) {
//     Object.assign(navigator, {
//         clipboard: {
//             writeText: jest.fn().mockResolvedValue(),
//         },
//     });
// }
//
// // If you need to create a dummy canvas globally for tests, you can attach a helper.
// global.createDummyCanvas = (width = 800, height = 600) => {
//     const canvas = document.createElement('canvas');
//     canvas.width = width;
//     canvas.height = height;
//     document.body.appendChild(canvas);
//     return canvas;
// };
//

// document.body.innerHTML = `
//   <canvas id="fractalCanvas"></canvas>
// `;
//
// // jest.setup.js
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});
//
// if (typeof Touch === 'undefined') {
//     global.Touch = class Touch {
//         constructor({ identifier, target, clientX, clientY }) {
//             this.identifier = identifier;
//             this.target = target;
//             this.clientX = clientX;
//             this.clientY = clientY;
//             // You can add other properties as needed.
//         }
//     };
// }