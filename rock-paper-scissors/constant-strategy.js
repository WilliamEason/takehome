const shots = ['rock', 'paper', 'scissors'];
const thisShot = shots[Math.floor(Math.random() * shots.length)];

exports.name = 'constant';

exports.recordShot = (playerId, shot) => {
};

exports.makeShot = (playerId) => {
    return thisShot;
};
