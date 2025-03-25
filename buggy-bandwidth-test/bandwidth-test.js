(function () {

    'use strict';

    // The master playlist URL.
    // See the HLS (HTTP Live Streaming) specification for more info:
    //   https://tools.ietf.org/html/rfc8216#section-4.1
    const MASTER_PLAYLIST_URL = 'https://lw.bamgrid.com/2.0/hls/vod/bam/ms02/hls/dplus/bao/master_unenc_avc_aac.m3u8';

    // Segment gap tolerance to account for rounding in the SourceBuffer.
    const SEGMENT_TOLERANCE = 0.001;

    const resolveURL = (base, pathname) => {
        if (!pathname.startsWith('/')) {
            pathname = `/${pathname}`;
        }

        return base.replace(/\/[0-9_a-z\-]+.m3u8$/, pathname);
    };

    // A simple EventEmitter which wraps a DOM node to dispatch events.
    class EventEmitter {
        constructor(domNode) {
            Object.defineProperty(this, 'domNode', {
                value: domNode
            });
        }

        on(eventType, listener) {
            this.domNode.addEventListener(eventType, listener);
        }

        off(eventType, listener) {
            this.domNode.removeEventListener(eventType, listener);
        }

        emit(eventType, detail) {
            const event = new CustomEvent(eventType, { detail });

            this.domNode.dispatchEvent(event);
        }
    }

    // A representation of an HLS playlist.
    // See the HLS (HTTP Live Streaming) specification for more info:
    //   https://tools.ietf.org/html/rfc8216#section-4.1
    class HlsPlaylist {
        addMapSegment(attributes) {
            const url = resolveURL(this.url, attributes.URI);

            Object.defineProperty(this, 'map', {
                enumerable: true,
                value: new HlsMapSegment({ url }),
            });
        }

        isLoaded() {
            return Boolean(this.map);
        }

        addSegments(segments, duration) {

            Object.defineProperties(this, {
                duration: {
                    enumerable: true,
                    value: duration,
                },
                segments: {
                    enumerable: true,
                    value: segments,
                },
            });
        }

        getSegmentForPosition(position) {
            const list = this.segments;

            let mid;
            let startIndex = 0;
            let endIndex = list.length - 1;

            // Simple binary search. This can perform 10 or 20 millisconds faster than the
            // brute force alternative.
            while (startIndex <= endIndex) {
                mid = Math.floor((startIndex + endIndex) / 2);

                if (list[mid].start <= position && position < list[mid].end) {
                    return list[mid];
                }

                if (list[mid].start < position) {
                    startIndex = mid + 1;
                } else {
                    endIndex = mid - 1;
                }
            }
        }
    }

    // A representation of an HLS video variant level.
    class VideoVariant extends HlsPlaylist {
        constructor(attributes) {
            super(attributes);

            Object.defineProperties(this, {
                type: {
                    enumerable: true,
                    value: 'video',
                },
                peakBitrate: {
                    enumerable: true,
                    value: parseInt(attributes.BANDWIDTH, 10),
                },
                averageBitrate: {
                    enumerable: true,
                    value: parseInt(attributes['AVERAGE-BANDWIDTH'], 10),
                },
                resolution: {
                    enumerable: true,
                    value: attributes.RESOLUTION,
                },
                audioGroupId: {
                    enumerable: true,
                    value: attributes.AUDIO,
                },
                codecs: {
                    enumerable: true,
                    value: attributes.CODECS.split(','),
                },
            });
        }

        setIndex(index) {
            Object.defineProperties(this, {
                index: {
                    enumerable: true,
                    value: index,
                },
                id: {
                    enumerable: true,
                    value: `[${index}]${this.resolution}`,
                },
            });
        }

        updateUrl(masterPlaylistUrl, pathname) {
            Object.defineProperty(this, 'url', {
                enumerable: true,
                value: resolveURL(masterPlaylistUrl, pathname),
            });
        }

        getVideoCodec() {
            return this.codecs.find((codec) => {
                return codec.startsWith('avc');
            });
        }

        getAudioCodec() {
            return this.codecs.find((codec) => {
                return codec.startsWith('mp4a');
            });
        }
    }

    // An HLS rendition group. In this case, the only media type we group is audio.
    class RenditionGroup {
        constructor(spec) {
            Object.defineProperties(this, {
                type: {
                    enumerable: true,
                    value: spec.type,
                },
                id: {
                    enumerable: true,
                    value: spec.id,
                },
                renditionPlaylists: {
                    enumerable: true,
                    value: [],
                },
            });
        }

        addRendition(renditionPlaylist) {
            this.renditionPlaylists.push(renditionPlaylist);
        }
    }

    // An HLS rendition representation. A rendition group could contain multiple renditions.
    class AudioRendition extends HlsPlaylist {
        constructor(masterPlaylistUrl, attributes) {
            super(attributes);

            Object.defineProperties(this, {
                type: {
                    enumerable: true,
                    value: 'audio',
                },
                groupId: {
                    enumerable: true,
                    value: attributes['GROUP-ID'],
                },
                url: {
                    enumerable: true,
                    value: resolveURL(masterPlaylistUrl, attributes.URI),
                },
                id: {
                    enumerable: true,
                    value: `en-${attributes['GROUP-ID']}`,
                },
            });
        }
    }

    // A representation of an HLS media segment (MP4 segments in our case).
    class HlsSegment {
        constructor(spec) {
            Object.defineProperties(this, {
                type: {
                    enumerable: true,
                    value: spec.type,
                },
                // The play length of this HLS MP4 segment in seconds.
                length: {
                    enumerable: true,
                    value: spec.length,
                },
                // The presentation start time of this HLS MP4 segment.
                start: {
                    enumerable: true,
                    value: spec.start,
                },
                // The presentation end time of this HLS MP4 segment.
                end: {
                    enumerable: true,
                    value: spec.start + spec.length,
                },
                playlistId: {
                    enumerable: true,
                    value: spec.playlistId,
                },
            });
        }

        updateUrl(mediaPlaylistUrl, pathname) {
            Object.defineProperty(this, 'url', {
                enumerable: true,
                value: resolveURL(mediaPlaylistUrl, pathname),
            });
        }

        updateNetworkMetrics({ byteLength, latency }) {
            // Object.defineProperties(this, {
            //     // The size of this MP4 segment in bytes.
            //     byteLength: {
            //         enumerable: true,
            //         value: byteLength,
            //     },
            //     // The download time of this MP4 segment in milliseconds.
            //     latency: {
            //         enumerable: true,
            //         value: latency,
            //     },
            // });

            this.byteLength = byteLength;
            this.latency = latency;
        }

        isMap() {
            return false;
        }
    }

    // An HLS initialization segment, also known as a "map".
    class HlsMapSegment {
        constructor({ url }) {
            Object.defineProperties(this, {
                url: {
                    enumerable: true,
                    value: url,
                }
            });
        }

        isMap() {
            return true;
        }
    }

    // Create a global event bus.
    // This will be a singleton.
    const emitter = new EventEmitter(document.body);

    const loadPlaylist = (url) => {
        return fetch(url).then((res) => {
            return res.text();
        }).catch((err) => {
            console.error('Error loading playlist:', url);
            console.error(err);
        });
    };

    const loadSegment = (segment, callback) => {

        let start;

        const xhr = new XMLHttpRequest();

        xhr.onerror = () => {
            console.error('XMLHttpRequest error event occured');
        };

        xhr.onreadystatechange = () => {

            if (xhr.readyState === 2) {

                // readyState === 2 is HEADERS_RECEIVED
                //
                // We start measuring latency when we have received the HTTP headers.
                start = Date.now();
            }
        };

        xhr.onload = () => {
            if (typeof segment.updateNetworkMetrics === 'function') {
                segment.updateNetworkMetrics({
                    byteLength: xhr.response.byteLength,
                    latency: Date.now() - start,
                });
            }

            callback(xhr);
        };

        xhr.open('GET', segment.url);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
    };

    const parseAttributesList = (input) => {
        const attrs = {};
        const quote = '"';

        const regex = /\s*(.+?)\s*=((?:".*?")|.*?)(?:,|$)/g;

        let match;
        // eslint-disable-next-line no-cond-assign
        while ((match = regex.exec(input)) !== null) {
            let value = match[2];

            // Remove double quotes.
            if (value.indexOf(quote) === 0 && value.lastIndexOf(quote) === (value.length - 1)) {
                value = value.slice(1, -1);
            }

            attrs[match[1]] = value;
        }

        return attrs;
    };

    const parseMasterPlaylist = (url, text) => {
        const lines = text.split('\n');

        const mediaTagRx = /^#EXT-X-MEDIA:/;
        const variantLevelRx = /^#EXT-X-STREAM-INF:/;

        const variantLevels = [];
        const groupedAudioRenditions = {};

        let nextLineIsUrl = false;

        lines.forEach((line) => {
            line = line.trim();

            let attributes;

            if (nextLineIsUrl) {
                nextLineIsUrl = false;
                variantLevels[variantLevels.length - 1].updateUrl(url, line);
            } else if (mediaTagRx.test(line)) {
                attributes = parseAttributesList(line.replace(mediaTagRx, ''));
                const rendition = new AudioRendition(url, attributes);

                let group = groupedAudioRenditions[rendition.groupId];

                if (!group) {
                    group = new RenditionGroup({
                        type: rendition.type,
                        id: rendition.groupId,
                    });

                    groupedAudioRenditions[group.id] = group;
                }

                group.addRendition(rendition);

            } else if (variantLevelRx.test(line)) {
                attributes = parseAttributesList(line.replace(variantLevelRx, ''));
                variantLevels.push(new VideoVariant(attributes));
                nextLineIsUrl = true;
            }
        });

        // Sort level on average bitrate, from lowest bitrate to highest.
        variantLevels.sort((a, b) => {
            if (a.averageBitrate && b.averageBitrate) {
                return a.averageBitrate - b.averageBitrate;
            }
            return a.peakBitrate - b.peakBitrate;
        });

        variantLevels.forEach(function (variant, index) {
            variant.setIndex(index);
        });

        return { variantLevels, groupedAudioRenditions };
    };

    const parseMediaPlaylist = (playlist, text) => {
        const lines = text.split('\n');

        const mapTagRx = /^#EXT-X-MAP:/;
        const segmentTagRx = /^#EXTINF:/;

        const segmentList = [];

        let currentSegment = null;

        let totalDuration = 0;

        lines.forEach((line) => {
            line = line.trim();

            if (currentSegment) {
                currentSegment.updateUrl(playlist.url, line);
                currentSegment = null;
            } else if (mapTagRx.test(line)) {
                const attributes = parseAttributesList(line.replace(mapTagRx, ''));
                playlist.addMapSegment(attributes);
            } else if (segmentTagRx.test(line)) {
                const length = parseFloat(line.replace(segmentTagRx, '').replace(/,$/, ''));

                currentSegment = new HlsSegment({
                    type: playlist.type,
                    playlistId: playlist.id,
                    length,
                    start: totalDuration,
                });

                segmentList.push(currentSegment);

                totalDuration += length;
            }
        });

        playlist.addSegments(segmentList, totalDuration);

        console.log(`parsed playlist type:${playlist.type} id:${playlist.id} ${playlist.url}`);

        return playlist;
    };

    const loadAndParseMediaPlaylist = (playlist) => {
        if (playlist.isLoaded()) {
            return Promise.resolve(playlist);
        }

        return loadPlaylist(playlist.url).then((text) => {
            return parseMediaPlaylist(playlist, text);
        }).catch((err) => {
            console.error('Error while loading and parsing media playlist:', playlist.url);
            console.error(err);
        });
    };

    // A factory function to create an audio/video SourceBuffer controller. This is a wrapper around
    // an MSE SourceBuffer instance. See the Media Source Extensions spec for more:
    //   https://www.w3.org/TR/media-source/
    //
    // - options.type - "audio" or "video"
    // - options.codec - The desired codec String for this buffer
    // - options.mediaElement - The video element DOM node
    // - options.mediaSource - The MediaSource instance
    const createSourceBufferController = (options) => {
        const {
            type,
            codec,
            mediaElement,
            mediaSource,
        } = options;

        const mimeCodec = type === 'video' ? `video/mp4; codecs=${codec}` : `audio/mp4; codecs=${codec}`;
        const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);

        // The SourceBuffer::mode should be "segments" by default, but it does not hurt to be explicit.
        sourceBuffer.mode = 'segments';

        // Keep track of HLS MP4 segment metadata in the buffer.
        const bufferedSegments = [];

        // Keep track of the currently buffered MP4 map segment.
        let currentMap = null;

        // Queue a function to execute when the SourceBuffer is ready.
        function whenReady(callback) {
            if (sourceBuffer.updating) {

                function checkUpdating() {
                    // Sometimes the SourceBuffer is not ready until the next turn of the event loop.
                    if (sourceBuffer.updating) {
                        setTimeout(checkUpdating, 0);
                    } else {
                        callback();
                    }
                }

                function onupdateend() {
                    sourceBuffer.removeEventListener('updateend', onupdateend);
                    checkUpdating();
                }

                sourceBuffer.addEventListener('updateend', onupdateend);
            } else {
                callback();
            }
        }

        // Private: Compute the bytes of an MP4 segment which are currently buffered.
        function computeBytesPortionOfSegmentBuffered(start, segment) {
            // How many seconds of this segment are buffered?
            const delta = segment.start - start;
            let length = segment.length;

            if (delta >= 0) {
                // The full segment is buffered.
                return segment.byteLength;
            } else {
                // If the delta is less than zero, then only part of this segment is buffered.
                length = length + delta;

                // How many bytes are in each second of video/audio?
                const bytesPerSecond = segment.byteLength / segment.length;

                return bytesPerSecond * length;
            }
        }

        // Private: Compute and emit the buffer metrics update event data.
        function computeBufferMetrics() {
            const position = mediaElement.currentTime;

            let start = 0;
            let end = 0;

            if (mediaElement.buffered.length > 0) {
                start = mediaElement.buffered.start(0);
                end = mediaElement.buffered.end(0);
            }

            const seconds = end - start;
            const forward = end - position;
            const backward = position - start;
            let segments = 0;
            let bytes = 0;

            let index = 0;

            while (index < bufferedSegments.length) {

                const segment = bufferedSegments[index];

                // If any part of the segment overlaps the buffered range then
                // we consider it to be buffered.
                if (segment.end > start && segment.start < end) {
                    segments++;
                    index++;
                    bytes += computeBytesPortionOfSegmentBuffered(start, segment);
                } else {
                    // This segment is no longer buffered. Remove it from the list.
                    bufferedSegments.splice(index, 1);
                }
            }

            emitter.emit('bufferMetricsUpdated', {
                position,
                start,
                end,
                seconds,
                forward,
                backward,
                segments,
                bytes,
            });
        }

        // Only track the video buffer.
        if (type === 'video') {
            sourceBuffer.addEventListener('updateend', computeBufferMetrics);
        }

        // Private: Append a content segment to the SourceBuffer
        function appendSegment(segment, arrayBuffer, callback) {
            if (type === 'video') {
                if (segment.isMap()) {
                    console.log(`buffering new ${type} map`);
                } else {
                    console.log(`buffering segment type:${type} playlist:${segment.playlistId} start:${segment.start} end:${segment.end}`);
                }
            }

            let bufferEndBeforeAppend = 0;

            if (sourceBuffer.buffered.length > 0) {
                bufferEndBeforeAppend = sourceBuffer.buffered.end(0);
            }

            function onUpdateEnd() {
                sourceBuffer.removeEventListener('updateend', onUpdateEnd);

                if (type === "video") {
                    if (segment.isMap()) {
                        console.log(`buffered new ${type} map`);
                    } else {
                        console.log(`buffered segment type:${type} playlist:${segment.playlistId} start:${segment.start} end:${segment.end}`);
                    }
                }

                let end = 0;

                if (sourceBuffer.buffered.length > 0) {
                    end = sourceBuffer.buffered.end(0);
                }

                callback();
            }

            whenReady(function () {

                if (segment.isMap()) {
                    currentMap = segment;
                } else {
                    bufferedSegments.push(segment);
                }

                sourceBuffer.appendBuffer(arrayBuffer);
                sourceBuffer.addEventListener('updateend', onUpdateEnd);
            });
        }

        // Private: Evict content from the SourceBuffer.
        function flush(start, end, callback) {

            function onUpdateEnd() {

                if (type === "video") {
                    console.log(`flushed buffer type:${type} start:${start} end:${end}`);
                }

                if (typeof callback === 'function') {
                    callback();
                }

                sourceBuffer.removeEventListener('updateend', onUpdateEnd);
            }

            whenReady(function () {
                sourceBuffer.addEventListener('updateend', onUpdateEnd);
                sourceBuffer.remove(start, end);
            });
        }

        return {
            appendSegment(segment, arrayBuffer, callback) {
                appendSegment(segment, arrayBuffer, callback);
            },

            flushAhead(callback) {
                const position = mediaElement.currentTime;
                const streamDuration = mediaElement.duration;

                // Keep 9 seconds to be safe. Do NOT want to flush the currently playing segment.
                const start = position + 9;

                // Only flush if the start position is not past the end of the stream.
                if (start < streamDuration) {
                    flush(start, Infinity, callback);
                } else {
                    callback();
                }
            },

            flushBehind() {
                const position = mediaElement.currentTime;
                const streamDuration = mediaElement.duration;

                // Keep 9 seconds to be safe. Do NOT want to flush the currently playing segment.
                const end = position - 9;

                if (end > 0 && end < streamDuration) {
                    flush(0, end);
                }
            },

            getCurrentlyBufferedMap() {
                return currentMap;
            },

            getBufferedRangeEnd() {
                if (sourceBuffer.buffered.length > 0) {
                    return sourceBuffer.buffered.end(0);
                }

                return 0;
            },
        };
    };

    const createHlsAudioStreamController = (options) => {
        const {
            mediaElement,
            mediaSource,
            groupedAudioRenditions,
            defaultVariantLevel,
        } = options;

        let currentVariantLevel = defaultVariantLevel;
        let sourceEnded = false;

        const sourceBufferController = createSourceBufferController({
            type: 'audio',
            codec: currentVariantLevel.getAudioCodec(),
            mediaElement,
            mediaSource,
        });

        emitter.on('variantLevelChange', function (ev) {
            currentVariantLevel = ev.detail.variantLevel;

            sourceBufferController.flushAhead(function () {
                if (sourceEnded) {
                    sourceEnded = false;
                    startNextSegmentLifecycle();
                }
            });
        });

        function getCurrentAudioPlaylist() {
            const groupId = currentVariantLevel.audioGroupId;
            const group = groupedAudioRenditions[groupId];

            // Use the default audio language rendition.
            return group.renditionPlaylists[0];
        }

        // If the map segment is already buffered for the current playlist then we buffer the
        // next mp4 content segment.
        // But, if the map segment is NOT buffered, then we need to append that to the buffer first.
        function selectNextSegment(playlist) {
            if (sourceBufferController.getCurrentlyBufferedMap() === playlist.map) {
                // Add 1 to the end of the current buffered range to ensure we get the NEXT segment.
                const end = sourceBufferController.getBufferedRangeEnd();
                //console.log('select next audio segment for position', end);
                return playlist.getSegmentForPosition(end + SEGMENT_TOLERANCE);
            }

            return playlist.map;
        }

        function loadAndBufferSegment(segment) {
            loadSegment(segment, (xhr) => {
                sourceBufferController.appendSegment(segment, xhr.response, startNextSegmentLifecycle);
            });
        }

        function startNextSegmentLifecycle() {
            const playlist = getCurrentAudioPlaylist();

            loadAndParseMediaPlaylist(playlist).then(() => {
                const segment = selectNextSegment(playlist);

                if (segment) {
                    sourceEnded = false;
                    loadAndBufferSegment(segment);
                } else {
                    console.warn('No more segments to load; reached end of audio stream');
                    sourceEnded = true;
                }
            }).catch((err) => {
                console.error('Error while loading and parsing a media playlist', playlist.url);
                console.error(err);
            });
        }

        function flushBackBuffer() {

            // If the stream has ended, then don't bother.
            if (mediaElement.ended) {
                return;
            }

            sourceBufferController.flushBehind();

            setTimeout(flushBackBuffer, 2000);
        }

        return {
            start() {
                startNextSegmentLifecycle();

                // Start flushing the back buffer 10 seconds after start.
                setTimeout(flushBackBuffer, 10000);
            },
        };
    };

    const createHlsVideoStreamController = (options) => {
        const { mediaElement, mediaSource, playlists } = options;

        let durationSet = false;
        let sourceEnded = false;
        let pendingQualityLevelChange = -1;
        let playlist;

        const sourceBufferController = createSourceBufferController({
            type: 'video',
            codec: playlists[0].getVideoCodec(),
            mediaElement,
            mediaSource,
        });

        // If the map segment is already buffered for the current playlist then we buffer the
        // next mp4 content segment.
        // But, if the map segment is NOT buffered, then we need to append that to the buffer first.
        function selectNextSegment() {
            if (sourceBufferController.getCurrentlyBufferedMap() === playlist.map) {
                // Add 1 to the end of the current buffered range to ensure we get the NEXT segment.
                const end = sourceBufferController.getBufferedRangeEnd();
                console.log('select next video segment for position', end);
                return playlist.getSegmentForPosition(end + SEGMENT_TOLERANCE);
            }

            return playlist.map;
        }

        function loadAndBufferSegment(segment) {
            loadSegment(segment, (xhr) => {
                emitter.emit('segmentLoaded', { segment });
                sourceBufferController.appendSegment(segment, xhr.response, startNextSegmentLifecycle);
            });
        }

        function startNextSegmentLifecycle() {
            if (pendingQualityLevelChange >= 0) {
                playlist = playlists[pendingQualityLevelChange];
                console.log('changing variant to', playlist.id);
                pendingQualityLevelChange = -1;
            }

            loadAndParseMediaPlaylist(playlist).then(() => {
                if (!durationSet) {
                    durationSet = true;
                    mediaSource.duration = playlist.duration;
                }

                const segment = selectNextSegment();

                if (segment) {
                    sourceEnded = false;
                    loadAndBufferSegment(segment);
                } else {
                    console.warn('No more segments to load; reached end of video stream');
                    sourceEnded = true;
                    mediaSource.endOfStream();
                }
            }).catch((err) => {
                console.error('Error while loading and parsing a media playlist', playlist.url);
                console.error(err);
            });
        }

        function flushBackBuffer() {

            // If the stream has ended, then don't bother.
            if (mediaElement.ended) {
                return;
            }

            sourceBufferController.flushBehind();

            setTimeout(flushBackBuffer, 2000);
        }

        return {
            start() {
                playlist = playlists[0];
                emitter.emit('variantLevelChange', { variantLevel: playlist });
                startNextSegmentLifecycle();

                // Start flushing the back buffer 10 seconds after start.
                setTimeout(flushBackBuffer, 10000);

                return playlist;
            },

            shiftQualityLevelUp() {
                const nextPlaylistIndex = playlists.indexOf(playlist) + 1;

                if (nextPlaylistIndex < playlists.length) {
                    pendingQualityLevelChange = nextPlaylistIndex;

                    sourceBufferController.flushAhead(function () {
                        if (sourceEnded) {
                            sourceEnded = false;
                            startNextSegmentLifecycle();
                        }
                    });

                    emitter.emit('variantLevelChange', { variantLevel: playlists[nextPlaylistIndex] });
                }
            },

            shiftQualityLevelDown() {
                const nextPlaylistIndex = playlists.indexOf(playlist) - 1;

                if (nextPlaylistIndex >= 0) {
                    pendingQualityLevelChange = nextPlaylistIndex;

                    sourceBufferController.flushAhead(function () {
                        if (sourceEnded) {
                            sourceEnded = false;
                            startNextSegmentLifecycle();
                        }
                    });

                    emitter.emit('variantLevelChange', { variantLevel: playlists[nextPlaylistIndex] });
                }
            }
        };
    };

    let controllersCreated = false;
    let stashedMediaElement;
    let stashedMediaSource;
    let stashedGroupedAudioRenditions;
    let stashedVariantLevels;

    // Call multiple times with new state:
    //  - Once when the MediaSource is open
    //  - Once when the master playlist has been loaded
    //
    // If all the dependencies are present, then start the stream.
    const maybeCreateControllers = (args) => {

        // This operation should be idempotent.
        if (controllersCreated) {
            return;
        }

        const {
            mediaElement,
            mediaSource,
            variantLevels,
            groupedAudioRenditions,
        } = args;

        if (mediaElement) {
            stashedMediaElement = mediaElement;
        }

        if (mediaSource) {
            stashedMediaSource = mediaSource;
        }

        if (groupedAudioRenditions) {
            stashedGroupedAudioRenditions = groupedAudioRenditions;
        }

        if (variantLevels) {
            stashedVariantLevels = variantLevels;
        }

        // If we have all our dependencies, then start the stream.
        if (stashedMediaElement && stashedMediaSource && stashedGroupedAudioRenditions && stashedVariantLevels) {

            controllersCreated = true;

            const videoController = createHlsVideoStreamController({
                mediaElement: stashedMediaElement,
                mediaSource: stashedMediaSource,
                playlists: stashedVariantLevels,
            });

            const defaultVariantLevel = videoController.start();

            const audioController = createHlsAudioStreamController({
                mediaElement: stashedMediaElement,
                mediaSource: stashedMediaSource,
                groupedAudioRenditions: stashedGroupedAudioRenditions,
                defaultVariantLevel,
            });

            audioController.start();

            //
            // Handle quality level change requests.
            //
            // If level changes are requested too frequently, it can cause issues with our buffering logic.
            // The correct way to implement this would be to queue up quality level change requests, and
            // execute them in serial when the buffer is ready.
            //
            // However, to avoid that complexity, we have chosen to throttle the click handlers instead.
            //

            let lastQualityLevelChange = Date.now();

            document.getElementById('upgrade-button').addEventListener('click', function () {
                const timeSinceLastChange = Date.now() - lastQualityLevelChange;

                // Throttle the frequency of invoking quality level changes;
                if (timeSinceLastChange > 3000) {
                    videoController.shiftQualityLevelUp();
                    lastQualityLevelChange = Date.now();
                }
            });

            document.getElementById('downgrade-button').addEventListener('click', function () {
                const timeSinceLastChange = Date.now() - lastQualityLevelChange;

                // Throttle the frequency of invoking quality level changes;
                if (timeSinceLastChange > 3000) {
                    videoController.shiftQualityLevelDown();
                    lastQualityLevelChange = Date.now();
                }
            });
        }
    };

    const loadAndParseMasterPlaylist = (url) => {
        loadPlaylist(url).then((text) => {
            const { variantLevels, groupedAudioRenditions } = parseMasterPlaylist(url, text);

            maybeCreateControllers({ variantLevels, groupedAudioRenditions });
        });
    };

    // Create and attach the MediaSource instance.
    const attachMedia = (mediaElement) => {
        const mediaSource = new MediaSource();

        function onMediaSourceOpen() {
            mediaSource.removeEventListener('sourceopen', onMediaSourceOpen);
            maybeCreateControllers({ mediaElement, mediaSource });
        }

        mediaSource.addEventListener('sourceopen', onMediaSourceOpen);

        mediaElement.src = URL.createObjectURL(mediaSource);
    };

    emitter.on('variantLevelChange', function ({ detail }) {
        const bytesPerSecond = detail.variantLevel.averageBitrate / 8;
        const megaBytesPerSecond = bytesPerSecond / 1000000; // 1,000,000 1 Million
        const info = `${detail.variantLevel.id} / ${megaBytesPerSecond.toFixed(3)} MB per second`;

        document.getElementById('table-variant').innerText = info;
    });

    // Keep a moving average of segment download samples.
    let segmentSamples = [];

    emitter.on('segmentLoaded', function ({ detail }) {
        const segment = detail.segment;

        if (segment.isMap()) {
            // Not interested in maps (init segments). They are only a few hundred bytes of data
            // and not applicable to bandwidth calculations.
            return;
        }

        segmentSamples.push(detail.segment);

        // Limit the sample size
        while (segmentSamples.length > 3) {
            segmentSamples.shift();
        }

        const { length, bytes, latency } = segmentSamples.reduce(function (values, segment) {
            // Segment length in seconds
            values.length += segment.length;
            // Segment size in bytes
            values.bytes += segment.byteLength;
            // Segment download latency in milliseconds
            values.latency += segment.latency;
            return values;
        }, { length: 0, bytes: 0, latency: 0 });

        // Average latency in milliseconds
        const averageLatency = (latency / segmentSamples.length);

        // Average dowload rate in MB per second
        const averageDownloadRate = (bytes / 1000000) / (latency / 1000);

        document.getElementById('table-segment-latency').innerText = `${Math.round(averageLatency)} milliseconds`;
        document.getElementById('table-download-rate').innerText = `${averageDownloadRate.toFixed(3)} MB per second`;
    });

    // Keep a moving average of playback rate
    let playbackRateSamples = [];

    emitter.on('bufferMetricsUpdated', function ({ detail }) {
        const { seconds, bytes } = detail;

        const megaBytes = bytes / 1000000;
        const currentRate = megaBytes / seconds;

        playbackRateSamples.push(currentRate);

        // Limit the sample size
        while (playbackRateSamples.length > 3) {
            playbackRateSamples.shift();
        }

        const total = playbackRateSamples.reduce(function (sum, sample) {
            return sum + sample;
        }, 0);

        const averagePlaybackRate = total / playbackRateSamples.length;

        document.getElementById('table-buffer-size').innerText = `${seconds.toFixed(1)} seconds / ${megaBytes.toFixed(2)} MB`;
        document.getElementById('table-playback-rate').innerText = `${averagePlaybackRate.toFixed(3)} MB per second`;
    });

    // Use a global flag to prevent the stream from being started more than once.
    let testInvoked = false;

    document.getElementById('run-test-button').addEventListener('click', function () {
        if (testInvoked) {
            console.warn('The test stream has already been started');
        } else {
            testInvoked = true;

            loadAndParseMasterPlaylist(MASTER_PLAYLIST_URL);

            const mediaElement = document.getElementById('media-element');

            mediaElement.autoplay = true;

            attachMedia(mediaElement);
        }
    });

    document.getElementById('stop-button').addEventListener('click', function () {
        // Force the media to detach.
        document.getElementById('media-element').src = null;
    });

}());
