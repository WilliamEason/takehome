# Solution
## Problem Recap

We have some code that pre-fetches buffers of video data, one buffer at a time. These buffers are placed in a list that's acting like a queue, using shift/push for FIFO effects.

Once we have more than some pre-determined count of buffers (5), the code attempts to begin purging the buffers we no longer need. 

```
        while (buffer.length > 5) {
            buffer.shift();
            bufferedSegments.shift();
        }
```


We think this should keep the total memory usage in check, but that's not working:
```
    // Append MP4 segments to the mock buffer, but keep the buffer size in check to avoid memory overflow.
    // For some reason, even though we keep the buffer size in check, memory consumption continues to grow.
```


## Analysis

When running the example, it appears that the `buffers` / `bufferedSegments` continue to consume more and more memory. Eventually, we would expect the garbage collector to do its job and free up the memory, but it doesn't.

> __Note: Finding the Leak()__
>
>I had some trouble with the metrics reported by `performance.memory` in Chrome, with all attributes appearing constant  `usedJSHeapSize`. As a workaround, I was able to use the memory developer tool, and do some dumps of the heap. These dumps clearly show references to numerous instances of `ArrayBuffer`, using hundreds of MBs of memory with >50 instances.

### Cause

The most likely cause appeared to be a dangling reference to the ArrayBuffers. This means that the buffers never meet the conditions required for the GC to actually free them up, so we continue to use more and more memory.

### Following the References

One thing I noticed is that once the stream completes, all of the memory is freed. This points to something holding on to a reference somewhere in `streamMovie`/`loadAndParsePlaylist`. If I knew how to read Heap snapshots better, they may have pointed me to the offending reference, but ultimately I figured out that we have a few similar references to a very similar object:
1. `fragmentedMP4Segments`: A list that push video segments to. Segments are an object that contain a string `url`, and a float `duration`
   1. The callback function takes the entire list of segments from [0..n] as its parameters, so we have something like the following on hand: `{segment{url:'x1.stream', duration: x1.duration}, segment{url:'x2.stream', duration: x2.duration}, ... }`
   2. This list of segments is then passed in to the callback of `loadAndParsePlaylist`. We are now holding a reference to these segments.
2. Within the callback, we have a closure that iterates through this segment list, pulling each `segment` one at a time. These segments are then loaded. The load involves pulling the actual data via `loadSegment`, and then storing this data in `segment.arrayBuffer`. Each segment now has a reference to the actual buffer data. Within the `loadSegment` function, we use a callback to append the buffers to the global lists, `buffer` and `bufferedSegments`
3. Within the callback to append buffers, we reference global vars `buffer` and `bufferedSegments`. It appears `buffer` is intended to hold the raw data, while `bufferedSegments` holds the entire segment.
   1. This appears redundant, since a segment already contains a buffer
4. Within the append, we attempt to free the memory by removing references the direct references to the ArrayBuffer in `buffer`, and the segment referenced in `bufferedSegments`. This is where we run into trouble...

`fragmentedMP4Segments` was a list of segments passed by reference, which we modified when we set `segment.arrayBuffer`. So now we have a caller holding onto segments with pointers to referrences to the arrayBuffers that we're leaking. Clearing the global var references is fine, but ultimately the loadPlaylist callback is holding a reference to each `segment`, which also includes the `arrayBuffer` itself. We need to remove this last reference so that the garbage collector can actually do its job

## Solution
### Naive

The most straightforwad solution appears to be simply setting the reference to the arrayBuffer on the segment that we're discarding to null.

```
        // Remove segments which we no longer need to simulate playback.
        while (buffer.length > 5) {
            // null the arrayBuffer in the segment that we're going to discard to help out the GC
            bufferedSegments[0].arrayBuffer = null;
            buffer.shift();
            bufferedSegments.shift();
        }
```
This eliminates the last reference to the arrayBuffers that we want to discard, and prevents the leak.

### Alternate Solution
It seems like holding all of the metadata (urls/durations) for fragementedSegments in memory is fine, while holding onto the actual buffer content is not feasible. We could narrow the scope of the `segment` arg into `segmentMetadata`, which only contains url/duration. Then we pass two args to the buffer append, metadata & raw buffer. That way, we don't have dangling array buffer references getting passed around through function args, which can more easily be lost. Granted, this pattern could allow for much smaller leaks of metadata, which could go undetected and become a nuisance later on.

e.g.
```
function appendBuffer(segmentMetadata, rawBuffer) {
    buffer.push(rawBuffer)
    bufferedSegments.push(segmentMetadata);
// ...

function streamMovie(playlistUrl) {
    loadAndParsePlaylist(playlistUrl, function (segmentList) {
        // ...
        function loadAndBufferSegment() {
            // ...
            loadSegment(segmentMetadata.url, function (arrayBuffer) {
                appendBuffer(segmentMetadata, arrayBuffer);
                // ...
```

The alternate solution is what I left in the code, but ultimately I'd bias towards whatever looked most similar to existing code.