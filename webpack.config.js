const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const FtpDeploy = require('ftp-deploy');
require('dotenv').config(); // Load environment variables from .env

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';

    // FTP deployment configuration
    const ftpDeploy = new FtpDeploy();
    const configFtp = {
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        host: process.env.FTP_HOST,
        port: process.env.FTP_PORT || 21,
        localRoot: path.join(__dirname, 'dist'),
        remoteRoot: process.env.FTP_REMOTE_ROOT,
        include: ['*', '**/*'],
        exclude: ['*.map'],
    };

    return {
        entry: './src/main.js',
        output: {
            filename: 'js/bundle.js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: ''
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
                        MiniCssExtractPlugin.loader,
                        'css-loader'
                    ]
                }
            ]
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: 'css/style.css'
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
            }),
            // Add FTP deploy plugin
            new (class {
                apply(compiler) {
                    compiler.hooks.done.tap('Deploy to FTP', () => {
                        if (isProduction) {
                            ftpDeploy.deploy(configFtp, function (err) {
                                if (err) {
                                    console.log('FTP Deploy Error:', err);
                                } else {
                                    console.log('FTP Deploy Success!');
                                }
                            });
                        }
                    });
                }
            })()
        ],
        optimization: {
            minimize: isProduction,
            minimizer: isProduction
                ? [
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
                ]
                : []
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
