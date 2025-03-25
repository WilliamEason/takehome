const shots = ['rock', 'paper', 'scissors'];

exports.name = 'random';

exports.recordShot = (playerId, shot) => {
};

exports.makeShot = (playerId) => {
    return shots[Math.floor(Math.random() * shots.length)];
};
