class RoundStart {
    constructor() {
        this.name = 'Round start';
        this.roundStarted = false;
        this.lastRound = 0;
        this.customizable = true;
    }

    handle(gameData, eventEmitter) {
        const status = gameData.status;
    
        if (status === 'pre_match' || status === 'round_over') {
            this.roundStarted = false;
            return;
        }

        if (this.roundStarted) {
            return;
        }
        if ((status === 'round_start' && (gameData.round != this.lastRound)) && !gameData.betweenRound) {
            this.roundStarted = true;
            eventEmitter.send('game.roundStart', {
                round: gameData.round,
                name: this.name
            });

            let teamsColor = gameData.defineColor();
            eventEmitter.send('vrml.colorChanged', teamsColor);
        }
    }
}

module.exports = RoundStart;
