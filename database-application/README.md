# Database Application Optimization
## Baseline
```
{
    "min": 2044,
    "max": 24994,
    "average": 14575
}
```

## Ideas for improvement
### Linear Search is costly
The linear search used to find a segment by stepping through each index one at a time is painfully slow.
Obviously we want to improve the algorithm we use to find the correct segment.


### Binary Search is better
I initial thought I could do a binary search by indexes, using knownLength as the max right index, 0 as the left, and then we just hone in on the media segment by looking left/right/etc.
E.g., if we want value `X`, we look at the middle index of (0,totalSegments), and then we bring the right or left side in, depending on if that range exceeds or falls short of the target value.

### Can we do better than Binary?
I think so.
We aren't just looking for an index.
We want to find the segment that contains our index.
We know how long the segments we've seen are, so we can take an educated guess as to where the next segment is.
We'll implement a Binary search, but with some improvements.
Basically, we use the same "left, right, middle" algorithm, except instead of assuming our target is the middle position, we use some math to make a best guess.
We can track the duration of all segments seen so far, `d`, and we know if we overshot or undershot on our last guess.
If we overshot, we look further to the right:

```
targetIdx = leftIdx + ((targetVal - leftVal) / d) // need to round this to get a proper index
```

And we do a similar pattern if we undershot, except we base our guess off the rightside index and look to the left.

Results: (with sample size increased 200).
On average, we are around 190x faster than the original case
```
{
    "min": 30,
    "max": 110,
    "average": 76
}
```

#### What if the underlying data changes?
We could keep a rolling average of duration so that we won't keep a stale database average

### More segments

Stress testing by multiplying total segments by 50, to 100k (increased searches to 200):
```
{
    "min": 61,
    "max": 157,
    "average": 112
}
```

### Making a better first guess
We gain valuable information from each search that we do: particularily, the average duration of segments.

Not only can we improve our guesses for each search, but we also gain enough information to make a more informed first-guess.
This gets us closer to the target right away:

```
function findSegment(res, knownLength, position) {
    // ...
    var initialGuess = 0;
    if (durationsRecorded > 0) {
        initialGuess = calculateTargetLookingLeft(0, lowestStartTime, position, averageDuration);
    } 
    tryNext(initialGuess);
```

I persisted the average duration of segments between calls, and saw another ~2x performance boost. Using some logs, we can see that the average duration converges on 7500, which aligns with the randomly generated duration range from 5000 to 10000.

Results from 500 calls:
```
{
    "min": 30,
    "max": 79,
    "average": 54
}
```
Application shows duration is predicated to be ~7450.
Note that The total durations recorded exceeds the number of calls, since we have to check multiple segments for each search.
calculation from 500 calls:
`get media segment for position 1743317868543, running average 7453.537906137184, durations 1108`

#### Comparative Impact
We can also quantify the impacts of smarter first guesses, by comparing the number of durations (segments) that we fetched.**

Even with a running average significantly closer to the true average, the first-guess at 0 still makes ~3 requests to find a segment: `1529/500 = 3.05`.

`get media segment for position 1742980695776, running average 7516.335513407457, durations 1529`

Compared to the smart-guess, `1108/500 = 2.216`, or 7/10 of the requests for the same outcome.

**These comparisons aren't perfect, because the actual average on the database fluctuates a bit (+/- 5 from what I saw), and there's some inherent "unfairness" in the luck of calculating averages, how quickly an average gets to ~7500, etc.

### Caching
We could potential cache segment durations on the client, to save even more time.

## Sharding
I didn't fully implement sharding with multiple db hosts respresenting individual pcs, but I did put a proof of concept in place with multiple ordered lists.
In theory, you'd let an underlying database direct handle some form of horizontal partitioning/sharding using range based criteria.

For this exercise, I showed how a db might map an index to a particular shard, and then retrieve the result from that shard.
