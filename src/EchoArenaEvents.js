const Overtime = require("./echo-arena-events/Overtime");
const RoundOver = require("./echo-arena-events/RoundOver");
const RoundStart = require("./echo-arena-events/RoundStart");
const PossessionChanged = require("./echo-arena-events/PossessionChanged");
const RoundTimeChanged = require("./echo-arena-events/RoundTimeChanged");
const ScoreChanged = require("./echo-arena-events/ScoreChanged");
const TeamChange = require("./echo-arena-events/TeamChange");
const ScoreBoard = require("./echo-arena-events/ScoreBoard");
const Restart = require("./echo-arena-events/Restart");
const Minimap = require('./echo-arena-events/Minimap');
const PingTracking = require('./echo-arena-events/PingTracking');
const sessionID = require('./echo-arena-events/SessionID');
const RoundBetween = require('./echo-arena-events/RoundBetween');

module.exports = [
    new Overtime(),
    new PossessionChanged(),
    new RoundOver(),
    new RoundBetween(),
    new RoundStart(),
    new TeamChange(),
    new ScoreBoard(),
    new Restart(),
    new RoundTimeChanged(),
    new ScoreChanged(),
    new sessionID(),
    new Minimap(),
    new PingTracking(),
];
