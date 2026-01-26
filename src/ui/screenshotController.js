/**
 * @module ScreenshotController
 * @author Radim Brnka
 * @description Screenshot capturing logic.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {JuliaRenderer} from "../renderers/juliaRenderer";
import {APP_NAME, CONSOLE_GROUP_STYLE, SCREENSHOT_JPEG_COMPRESSION_QUALITY} from "../global/constants";
import {expandComplexToString} from "../global/utils";
import {isJuliaMode} from "./ui";

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
 * Returns watermark text lines for current fractal type and its properties.
 * @param {FractalRenderer} fractalApp
 * @return {{line1: string, line2: string}}
 */
function getWatermarkLines(fractalApp) {
    const fractalType = isJuliaMode() ? 'Julia' : 'Mandelbrot';
    const line1 = APP_NAME;
    const line2 = `${fractalType}: p=${expandComplexToString(fractalApp.pan.slice(), 6)}, zoom=${fractalApp.zoom.toExponential(2)}` +
        `${(fractalApp instanceof JuliaRenderer) ? `, c=${expandComplexToString(fractalApp.c)}` : ``}`;
    return {line1, line2};
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
    console.groupCollapsed(`%c takeScreenshot`, CONSOLE_GROUP_STYLE);

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
    const {line1, line2} = getWatermarkLines(fractalApp);
    const fontSize = 12;
    const lineSpacing = 4;
    const padding = 6;
    const borderWidth = 1;

    // Font styles matching h1 for line1
    const line1Font = `italic ${fontSize}px "Bruno Ace SC", sans-serif`;
    const line2Font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

    ctx.textAlign = 'center';
    ctx.letterSpacing = '1px';
    ctx.textBaseline = 'middle';

    // Measure text widths
    ctx.font = line1Font;
    const line1Width = ctx.measureText(line1).width;
    ctx.font = line2Font;
    const line2Width = ctx.measureText(line2).width;

    // Calculate rectangle size for two lines
    const maxTextWidth = Math.max(line1Width, line2Width);
    const rectWidth = maxTextWidth + padding * 2 + borderWidth * 2;
    const rectHeight = fontSize * 2 + lineSpacing + padding * 2 + borderWidth * 2;

    // Position the rectangle in the bottom-right corner
    const x = offscreenCanvas.width - rectWidth - padding;
    const y = offscreenCanvas.height - rectHeight - padding;

    // Draw the semi-transparent black background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    drawRoundRect(ctx, x, y, rectWidth, rectHeight, 8);
    ctx.fill();

    // Draw the text centered within the rectangle
    const textX = x + rectWidth / 2;
    const line1Y = y + padding + borderWidth + fontSize / 2;
    const line2Y = line1Y + fontSize + lineSpacing;

    // Draw line 1 (app name with h1 styling)
    ctx.font = line1Font;
    ctx.fillStyle = accentColor;
    ctx.fillText(line1, textX, line1Y);

    // Draw line 2 (coordinates)
    ctx.font = line2Font;
    ctx.fillStyle = accentColor;
    ctx.fillText(line2, textX, line2Y);

    // Create a temporary link for downloading the image
    const link = document.createElement('a');

    // Set the download attributes
    link.setAttribute('download', getFilename());
    link.setAttribute('href', offscreenCanvas.toDataURL("image/jpeg", SCREENSHOT_JPEG_COMPRESSION_QUALITY));
    link.click();

    console.log('Screenshot successfully taken.');
    console.groupEnd();
}