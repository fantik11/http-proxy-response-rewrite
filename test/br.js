var assert = require('chai').assert;

var zlib = require('zlib');
var http = require('http');
var httpProxy = require('http-proxy');
var modifyResponse = require('../');

var SERVER_PORT = 5000;
var TARGET_SERVER_PORT = 5001;

// Create a proxy server
var proxy = httpProxy.createProxyServer({
    target: 'http://localhost:' + TARGET_SERVER_PORT
});

// Listen for the `proxyRes` event on `proxy`.
proxy.on('proxyRes', function (proxyRes, req, res) {
    modifyResponse(res, proxyRes.headers['content-encoding'], function (body) {
        if (body) {
            body = JSON.parse(body);
            // modify some information
            body.age = 2;
            delete body.version;
        }
        return JSON.stringify(body);
    });
});

// Create your server and then proxies the request
var server = http.createServer(function (req, res) {
    proxy.web(req, res);
}).listen(SERVER_PORT);

// Create your target server
var targetServer = http.createServer(function (req, res) {

    // Create brotli content
    var br = zlib.createBrotliCompress();
    var _write = res.write;
    var _end = res.end;

    br.on('data', function (buf) {
        _write.call(res, buf);
    });
    br.on('end', function () {
        _end.call(res);
    });

    res.write = function (data) {
        br.write(data);
    };
    res.end = function () {
        br.end();
    };

    res.writeHead(200, {'Content-Type': 'application/json', 'Content-Encoding': 'br'});
    res.write(JSON.stringify({name: 'node-http-proxy-json', age: 1, version: '1.0.0'}));
    res.end();
}).listen(TARGET_SERVER_PORT);

describe("modifyResponse--br", function () {
    it('br: modify response json successfully', function (done) {
        // Test server
        http.get('http://localhost:' + SERVER_PORT, function (res) {
            var body = '';
            var br = zlib.createBrotliDecompress();
            res.pipe(br);

            br.on('data', function (chunk) {
                body += chunk;
            }).on('end', function () {
                assert.equal(JSON.stringify({name: 'node-http-proxy-json', age: 2}), body);

                proxy.close();
                server.close();
                targetServer.close();

                done();
            });
        });
    });
});



