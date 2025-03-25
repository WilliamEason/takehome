(function () {

    // The media playlist URL.
    // See the HLS (HTTP Live Streaming) specification for more info:
    //   https://tools.ietf.org/html/rfc8216#section-4.1
    var MEDIA_PLAYLIST_URL = 'https://lw.bamgrid.com/2.0/hls/vod/bam/ms02/hls/dplus/bao/avc/unenc/8500k/vod.m3u8';

    // Keep a mock buffer of 5 segments available for playback.
    var buffer = [];
    var bufferedSegments = [];

    // Append MP4 segments to the mock buffer, but keep the buffer size in check to avoid memory overflow.
    // For some reason, even though we keep the buffer size in check, memory consumption continues to grow.
    function appendBuffer(segmentMetadata, rawBuffer) {
        buffer.push(rawBuffer)
        bufferedSegments.push(segmentMetadata);

        // Remove segments which we no longer need to simulate playback.
        while (buffer.length > 5) {
            buffer.shift();
            bufferedSegments.shift();
        }

        var totalBufferDuration = bufferedSegments.reduce(function (duration, segment) {
            return duration + segment.duration;
        }, 0);

        var totalBufferSize = buffer.reduce(function (size, arrayBuffer) {
            return size + arrayBuffer.byteLength;
        }, 0);

        var memoryUsed = window.performance.memory.usedJSHeapSize;

        console.log(
            'Buffered segment: Segments buffered:', buffer.length,
            'Buffer duration (seconds):', Math.round(totalBufferDuration),
            'Buffer size (Mb)', Math.round(totalBufferSize / 1000000),
            'Memory used (Mb)', Math.round(memoryUsed / 1000000)
        );
    }

    // Load the media playlist from the CDN. The callback will be called with a String representing
    // the XHR responseText.
    function loadPlaylist(url, callback) {

        var xhr = new XMLHttpRequest();

        xhr.onerror = function () {
            console.error('XMLHttpRequest error event occured');
        };

        xhr.onload = function () {
            callback(xhr.responseText);
        };

        xhr.open('GET', url);

        xhr.send(null);
    }

    // Load an MP4 segment from the CDN. The callback will be called with an ArrayBuffer representing
    // the MP4 video content data.
    function loadSegment(url, callback) {

        var xhr = new XMLHttpRequest();

        xhr.onerror = function () {
            console.error('XMLHttpRequest error event occured');
        };

        xhr.onload = function () {
            callback(xhr.response);
        };

        xhr.open('GET', url);

        xhr.responseType = 'arraybuffer';

        xhr.send(null);
    }

    // A quick (and fragile) way to resolve a segment URL with the playlist URL it belongs to.
    // This method of URL resolution is not likely to work for other streams.
    function resolveSegmentURL(base, segmentPath) {
        return base.replace('vod.m3u8', segmentPath);
    }

    // Load an HLS (HTTP Live Streaming) media playlist and return the parsed segment definitions.
    function loadAndParsePlaylist(url, callback) {
        loadPlaylist(url, function (playlist) {

            // Keep a list of video MP4 fragments (segments).
            var fragmentedMP4Segments = [];

            var lines = playlist.split('\n');
            var line;
            var duration;
            var currentSegment;
            var i;

            for (i = 0; i < lines.length; i++) {
                line = lines[i];

                if (currentSegment) {
                    currentSegment.url = resolveSegmentURL(url, line);
                    fragmentedMP4Segments.push(currentSegment);
                    currentSegment = null;
                }

                if (line.indexOf('#EXTINF') === 0) {
                    duration = line.split(':').pop().replace(/,$/, '');

                    currentSegment = {
                        duration: parseFloat(duration)
                    };
                }
            }

            callback(fragmentedMP4Segments);
        })
    }

    // Stream the movie into a mock buffer for testing purposes.
    function streamMovie(playlistUrl) {
        loadAndParsePlaylist(playlistUrl, function (segmentList) {

            var currentSegmentIndex = 0;

            function loadAndBufferSegment() {
                var segmentMetadata = segmentList[currentSegmentIndex];

                if (!segmentMetadata) {
                    console.log('Done. No more MP4 segments to play');
                    return;
                }

                loadSegment(segmentMetadata.url, function (arrayBuffer) {
                    appendBuffer(segmentMetadata, arrayBuffer);

                    currentSegmentIndex++

                    // Load a new segment every 2 seconds for this test.
                    setTimeout(loadAndBufferSegment, 2000);
                });
            }

            loadAndBufferSegment();
        });
    }

    document.getElementById('run-test-button').addEventListener('click', function () {
        console.log('Starting test');
        streamMovie(MEDIA_PLAYLIST_URL);
    });

}());
