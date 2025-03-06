/**
 * @module ScreenshotController
 * @author Radim Brnka
 * @description Screenshot capturing logic.
 */

import {JuliaRenderer} from "../renderers/juliaRenderer";
import {APP_NAME, DEFAULT_CONSOLE_GROUP_COLOR} from "../global/constants";
import {expandComplexToString} from "../global/utils";

/**
 * Generates filename based on current timestamp
 * @return {string}
 */
function getFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `fractal-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
}

/**
 * Returns watermark text that fits current fractal type and its properties.
 * @param {FractalRenderer} fractalApp
 * @return {string}
 */
function getWatermarkText(fractalApp) {
    const fractalType = fractalApp.constructor.name;
    return `Created by ${APP_NAME} (${fractalType.substring(0, fractalType.length - 8 /* Remove the "Renderer" string */)}: ` +
        `p=${expandComplexToString(fractalApp.pan.slice(), 6)}, zoom=${fractalApp.zoom.toFixed(6)}` +
        `${(fractalApp instanceof JuliaRenderer) ? `, c=${expandComplexToString(fractalApp.c)})` : `)`}`;
}

/**
 * Draws rectangle with rounded borders
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Generates screenshot of the canvas, adds watermark and emulates link click to download the file.
 * @param {HTMLCanvasElement} canvas
 * @param {FractalRenderer} fractalApp
 * @param {string} accentColor
 */
export function takeScreenshot(canvas, fractalApp, accentColor) {
    console.groupCollapsed(`%c takeScreenshot`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    // Ensure the fractal is fully rendered before taking a screenshot
    fractalApp.draw();

    // Create an offscreen canvas for watermarking
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) {
        console.error('Unable to get 2D context for the canvas.');
        return;
    }

    // Copy the fractal canvas content to the offscreen canvas
    ctx.drawImage(canvas, 0, 0);

    // Define the watermark text and style
    let watermarkText = getWatermarkText(fractalApp);
    const fontSize = 12;
    const padding = 6;
    const borderWidth = 1;

    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure the text width and calculate the rectangle size
    const textWidth = ctx.measureText(watermarkText).width;
    const rectWidth = textWidth + padding * 2 + borderWidth * 2;
    const rectHeight = fontSize + padding * 2 + borderWidth * 2;

    // Position the rectangle in the bottom-right corner
    const x = offscreenCanvas.width - rectWidth - padding;
    const y = offscreenCanvas.height - rectHeight - padding;

    // Draw the semi-transparent black background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    drawRoundRect(ctx, x, y, rectWidth, rectHeight, 8);  // 10 is the corner radius, adjust as needed
    ctx.fill();

    // Draw the border
    // ctx.strokeStyle = accentColor;
    // ctx.lineWidth = borderWidth;
    // drawRoundRect(ctx, x, y, rectWidth, rectHeight, 8);
    // ctx.stroke();

    // Draw the text centered within the rectangle
    const textX = x + rectWidth / 2;
    const textY = y + rectHeight / 2 + 1;
    ctx.fillStyle = accentColor;
    ctx.fillText(watermarkText, textX, textY);

    // Create a temporary link for downloading the image
    const link = document.createElement('a');

    // Set the download attributes
    link.setAttribute('download', getFilename());
    link.setAttribute('href', offscreenCanvas.toDataURL("image/jpeg", 0.95));
    link.click();

    console.log('Screenshot successfully taken.');
    console.groupEnd();
}