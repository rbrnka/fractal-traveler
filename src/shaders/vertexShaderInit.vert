/*
 * Vertex Shader Initializer
 * @author    Radim Brnka
 * @project   Synaptory Fractal Traveler
 * @copyright 2025-2026
 * @license   MIT
 */

precision highp float;
attribute vec4 a_position;

void main() {
    gl_Position = a_position;
}