# HLS Streaming / JavaScript Debugging Exercises
There are 4 potential problems to choose from. There are two General Programming Problems, and 2 Video Player Debugging problems. All problems are very much focused on JavaScript programming. The General Programming Problems run in the Node.js environment, while the Video Player Debugging Problems run in the Chrome web browser from a Node.js server.

## General Programmer Problems
Run in the Node.js environment.

### Installation
The only dependency is the Node.js runtime. There are no npm dependencies to install (unless you choose to add some).

### Rock Paper Scissors
This is a "distributed" game between multiple peers (nodes). By default there are 3 nodes. Each node is created by running the `rock-paper-scissors/player.js` script in a console. A port and strategy should be chosen for each node when you start it up.

To get started, open 3 terminal instances and execute the script in each one. The first command line argument is the port number, and the second command line argument is the game strategy to use. The first port must be 9001, the second 9002, and the third 9003. The strategies must be one of "random", "constant", or "custom". By default, the custom strategy uses a non standard game play, and thereby it always loses.

Terminal 1:
```
$ node rock-paper-scissors/player.js 9001 random
```

Terminal 2:
```
$ node rock-paper-scissors/player.js 9002 constant
```

Terminal 3:
```
$ node rock-paper-scissors/player.js 9003 custom
```

Your __main task__ is to work on the custom strategy in `rock-paper-scissors/custom-strategy.js` to modify it so that it will beat the random and constant strategies in a three way match of 1000 iterations.

Your __bonus task__ could be 1 of 2 things:

1. Modify the `player.js` module so that you can start N number of players and they can all play against each other. The crux of the problem is to ensure they all get the same number of turns and will play different players equally over a long enough time range.
2. Modify the custom strategy to be able to beat two or more other random strategies (not constant) in a 3 way match of 1000 iterations.

### Query an Ordered List
This problem consists of 3 Node.js scripts in the `database-application/` directory. There are 2 HTTP servers and one testing client:

- __database-server.js__ Creates an ordered list of mock data and serves as a simple database made of up a single ordered list media segments.
- __application-server.js__ Creates an application server which provides an HTTP API for applications to find media segment for a given point in the media timeline.
- __perf-test-client.js__ A script which queries the application server to test the performance of the end to end system.

The database is a single, simple, ordered list. Each item in the list represents a media segment of a full feature length movie. The segments have the data shape of { start:timestamp, end:timestamp, duration:integer }. The database ingests 2 thousand of them ordered from lowest start time to highest start time. Clients will need to query the application server for a media segment which contains media for a given timestamp. The application server locates the media segment for the given timestamp using the simple *get by index* operation the database server makes available.

To get started, open 3 terminal instances and execute each script in each one.

Terminal 1 (start the database server first):
```
$ node database-application/database-server.js
```

Terminal 2 (start the application server second):
```
$ node database-application/application-server.js
```

Terminal 3 (run the performance test script last, and expect this to take long time):
```
$ node database-application/perf-test-client.js
```

Your __main task__ is to optimize the query in the application server to improve the query performance as much as you can (without modifying the database-server.js file). The application server is currently using a brute force approach, which you can probably replace with something much better.

Your __bonus task__ is to increase the number of items in the ordered list in the database server and add data sharding.

## Player Debugging
Run in the Chrome web browser from a Node.js server.

### Installation
The only dependency is the Node.js runtime.

From the directory where this archive was unpacked, run:

```
$ npm install
```

### Running The Dev Server
Once you have Node.js, and have run `npm install`, then run the server with:

```
$ npm start
```

The URL to access the server can be found in the command line output from running `npm start`.

### Memory Leak Problem
We have a confirmed memory leak in a hypothetical video player. We've been able to isolate the problem to our MP4 segment loading pipeline. So, we have extracted the pipeline to this test in ./memory-leak.js. After logging out the memory consumption in the Chrome browser we have noticed that the buffer size remains nearly constant, but the overall memory consumption of the browser runtime continues to grow out of control.

Your task is to make a change to the code in ./memory-leak.js to fix this memory leak and hold the overall memory consumption more consistent.

Open the developer tools and observe the console as you run this test to see the results.

__!!NOTE!!__

This test only works in Chrome because of the use of the performance.memory API.

### Buggy Bandwidth Test
The second problem is a simple video player created to test local bandwidth and playback conditions. It seems to work fine for the most part, but has a bug for you to solve.

If you play the video, and then manually ramp it up to the highest quality level ([9]1920x1080 / 1.074 MB per second) then the video will eventually freeze. There is an error logged out in the inspector console which might lend a clue to the root cause.

Your job is to find the bug and fix it so that the test video will play all the way through to the end without freezing.

