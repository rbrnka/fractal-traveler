const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';

    return {
        entry: './src/main.js',
        output: {
            filename: isProduction ? 'js/bundle.[contenthash].js' : 'js/bundle.js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: '',
            clean: true, // Clean the dist folder before each build
        },
        mode: isProduction ? 'production' : 'development',
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env']
                        }
                    }
                },
                {
                    test: /\.css$/,
                    use: [
                        isProduction ? MiniCssExtractPlugin.loader : 'style-loader', // For instant CSS reload in dev
                        // MiniCssExtractPlugin.loader, // For aligned behavior between dev and prod
                        'css-loader'
                    ]
                },
                {
                    test: /\.(frag|vert|glsl)$/,
                    type: 'asset/source',
                },
                {
                    test: /\.json$/,
                    type: 'json',
                    include: path.resolve(__dirname, 'src/data')
                }
            ]
        },
        plugins: [
            new webpack.DefinePlugin({
                '__DEV__': JSON.stringify(!isProduction),
                'process.env.DEBUG_MODE': JSON.stringify(
                    isProduction ? 'NONE' : 'FULL'
                ),
            }),
            new MiniCssExtractPlugin({
                filename: isProduction ? 'css/style.[contenthash].css' : 'css/style.css'
            }),
            new HtmlWebpackPlugin({
                template: './index.html',
                minify: isProduction
                    ? {
                        removeComments: true,
                        collapseWhitespace: true,
                        removeAttributeQuotes: true
                    }
                    : false
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, 'src/img'),
                        to: 'img'
                    }
                ]
            })
        ],
        optimization: {
            minimize: isProduction,
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        compress: {
                            drop_console: true, // Remove console.* in production
                            drop_debugger: true // Remove debugger in production
                        },
                        output: {
                            comments: false // Remove comments
                        }
                    },
                    extractComments: false
                }),
                new CssMinimizerPlugin()
            ],
        },
        resolve: {
            extensions: ['.js']
        },
        devtool: isProduction ? 'source-map' : 'eval-source-map', // Faster source maps in development
        devServer: {
            static: {
                directory: path.join(__dirname, 'dist')
            },
            compress: true,
            port: 8080,
            open: false,
            hot: true, // Enable Hot Module Replacement in development
            client: {
                overlay: {
                    warnings: false,
                    errors: true
                }
            }
        }
    };
};
