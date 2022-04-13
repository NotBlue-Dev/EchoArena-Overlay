class ScoreBoard {
    constructor() {
        this.name = 'scoreBoard (do not use)'
        this.blue = []
        this.orange = []
        this.customizable = false
    }

    handle(gameData, eventEmitter) {
        if (JSON.stringify(gameData.blueTeam.playerStats) === JSON.stringify(this.blue) && (JSON.stringify(gameData.orangeTeam.playerStats) === JSON.stringify(this.orange))) {
            return 
        }
        this.blue = gameData.blueTeam.playerStats
        this.orange = gameData.orangeTeam.playerStats

        eventEmitter.send('game.scoreBoard', {
            blue: this.blue,
            orange: this.orange,
            name:this.name
        })
    }
}

module.exports = ScoreBoard
