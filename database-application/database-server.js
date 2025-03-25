const http = require('http');

const PORT = 8901;
const DATABASE_SIZE = 100000;
const MAX_SHARD_SIZE = 9000;

// The "database" is simply an ordered list of media chunk metadata objects.
const orderedLists = [];

// Create fake media segment data and populate the database with the results.
// (The "database" is simply an ordered list in memory above.)
function createFakeMediaSegmentsData() {
    // Initialize the media timeline cursor
    let timelineCursor = Date.now();
    const maxDuration = 10000;
    const minDuration = 5000;

    let currentShard = 0;
    orderedLists[currentShard] = [];

    for (let i = 0; i < DATABASE_SIZE; i++) {
        const duration = Math.round(Math.random() * (maxDuration - minDuration) + minDuration);

        if (orderedLists[currentShard].length >= MAX_SHARD_SIZE) {
            currentShard++;
            orderedLists[currentShard] = [];
        }

        orderedLists[currentShard].push({
            duration,
            start: timelineCursor,
            end: timelineCursor + duration,
            index: i,
        });

        timelineCursor += duration;
    }
}


const server = http.createServer((req, res) => {
    const base = `http://localhost:${server.address().port}`;
    const url = new URL(req.url, base);

    const response = { result: null };
    let status = 404;

    if (url.pathname === '/range') {
        let lastShardIdx = (orderedLists.length)-1
        let lastItemOfLastShard = (DATABASE_SIZE - 1) - (lastShardIdx * MAX_SHARD_SIZE)

        // console.log('last shard idx %d, last item idx %d', lastShardIdx, lastItemOfLastShard)
        // console.log(orderedLists[lastShardIdx][lastItemOfLastShard])

        status = 200;
        response.result = {
            start: orderedLists[0][0].start,
            end: orderedLists[lastShardIdx][lastItemOfLastShard].end,
            length: DATABASE_SIZE,
        };
    } else if (url.pathname === '/query') {
        const index = parseInt(url.searchParams.get('index'), 10);

        shard = Math.floor(index / MAX_SHARD_SIZE);
        shardIdx = index - (shard * MAX_SHARD_SIZE);

        console.log('getting index: %d, shard %d, shardIdx: %d', index, shard, shardIdx);
        const result = orderedLists[shard][shardIdx];
        //const result = orderedLists[0][index] || null;

        if (result) {
            status = 200;
        }

        response.result = result;
    } else {
        response.result = null;
    }

    const message = JSON.stringify(response);

    // Simulate disk and network work loads with a timeout.
    setTimeout(() => {
        res.writeHead(status, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(message),
        });

        res.end(message);
    }, 10);
});

server.on('listening', () => {
    const { port } = server.address();
    console.log('Database server listening on port', port);
});

// Seed the database and start the server.
createFakeMediaSegmentsData();
console.log('created shards %d, dbSize: %d', orderedLists.length, DATABASE_SIZE)
let lastShardIdx = orderedLists.length-1
let lastItemOfLastShard = (DATABASE_SIZE - 1) - (lastShardIdx * MAX_SHARD_SIZE)
console.log('last shard idx %d, last item idx %d', lastShardIdx, lastItemOfLastShard)
server.listen(PORT);
