var zlib = require('zlib');
var concatStream = require('concat-stream');
var BufferHelper = require('bufferhelper');

/**
 * Modify the response
 * @param res {Object} The http response
 * @param proxyRes
 * @param callback {Function} Custom modified logic
 */
module.exports = function modifyResponse(res, proxyRes, callback) {

    let contentEncoding = proxyRes;

    if (proxyRes && proxyRes.headers) {
        contentEncoding = proxyRes.headers['content-encoding'];
        // Delete the content-length if it exists. Otherwise, an exception will occur
        // @see: https://github.com/langjt/node-http-proxy-json/issues/10
        if ('content-length' in proxyRes.headers) {
            delete proxyRes.headers['content-length'];
        }
    }

    var unzip, zip;
    // Now only deal with the gzip/deflate/undefined content-encoding.
    switch (contentEncoding) {
        case 'gzip':
            unzip = zlib.Gunzip();
            zip = zlib.Gzip();
            break;
        case 'deflate':
            unzip = zlib.Inflate();
            zip = zlib.Deflate();
            break;
        case 'br':
            unzip = zlib.createBrotliDecompress()
            zip = zlib.createBrotliCompress();
            break;
    }

    // The cache response method can be called after the modification.
    var _write = res.write;
    var _end = res.end;

    if (unzip) {
        unzip.on('error', function (e) {
            console.log('Unzip error: ', e);
            _end.call(res);
        });
        handleCompressed(res, _write, _end, unzip, zip, callback);
    } else if (!contentEncoding) {
        handleUncompressed(res, _write, _end, callback);
    } else {
        console.log('Not supported content-encoding: ' + contentEncoding);
    }
};

/**
 * handle compressed
 */
function handleCompressed(res, _write, _end, unzip, zip, callback) {
    // The rewrite response method is replaced by unzip stream.
    res.write = function (data) {
        unzip.write(data);
    };

    res.end = function () {
        unzip.end();
    };

    // Concat the unzip stream.
    var concatWrite = concatStream(function (data) {
        var body = data.toString();

        // Custom modified logic
        if (typeof callback === 'function') {
            body = callback(body);
        }

        body = new Buffer(body);

        // Call the response method and recover the content-encoding.
        zip.on('data', function (chunk) {
            _write.call(res, chunk);
        });
        zip.on('end', function () {
            _end.call(res);
        });

        zip.write(body);
        zip.end();
    });

    unzip.pipe(concatWrite);
}

/**
 * handle Uncompressed
 */
function handleUncompressed(res, _write, _end, callback) {
    var buffer = new BufferHelper();
    // Rewrite response method and get the content.
    res.write = function (data) {
        buffer.concat(data);
    };

    res.end = function () {
        var body = buffer.toBuffer().toString();

        // Custom modified logic
        if (typeof callback === 'function') {
            body = callback(body);
        }

        body = new Buffer(body);

        // Call the response method
        _write.call(res, body);
        _end.call(res);
    };
}
