const ConfigLoader = require('./ConfigLoader')
const OBSClient = require('./OBSClient')
const OverlayWS = require('./ws/OverlayWS')
const VRMLClient = require('./VRMLClient')
const EchoArena = require('./EchoArena')
const EventHandler = require('./EventHandler')
const events = require('./EchoArenaEvents.js')
const path = require('path');
const exec = require('child_process').exec;

class OBSPlayer {
    constructor(rootPath, eventEmitter) {
        this.configLoader = new ConfigLoader(rootPath)
        this.globalConfig = this.configLoader.load();
        this.eventEmitter = eventEmitter
        this.eventEmitter.send('config.loaded', this.globalConfig)
        this.spectateStarted = false
        this.obsClient = new OBSClient(eventEmitter)
        this.overlayWS = new OverlayWS(this.globalConfig.overlayWs, this.eventEmitter, rootPath)
        this.scenes = []
        this.eventHandler = null
        this.echoArena = null
        this.vrmlInfo = null
        this.vrmlInfoWS = []

        this.config = this.globalConfig.echoArena
        this.vrmlClient = new VRMLClient()
        this.infoState = false
        this.Allinfo = {
            "teams":[],
            "times":[],
            "week":null,
            "season":null,
        }

        
    }

    async start() {
        try {
            await this.loadTeamList()
            //await this.connectVrml(this.globalConfig.vrml.teamId)
        } catch (err) {
            console.error(err.message)
        }

        this.obsConnectionState = false
        this.initializeListeners()
    }

    initializeWS() {
        this.eventEmitter.on('overlayWs.launchServer', (args, event) => {
            this.overlayWS.startServer(args.port).then(() => {
                this.eventEmitter.add({send:this.overlayWS.send, on:this.overlayWS.on})
                this.globalConfig.overlayWs.autoLaunch = args.autoLaunch
                this.globalConfig.overlayWs.port = args.port
                this.configLoader.save(this.globalConfig)
                this.eventEmitter.send('overlayWs.listening', args)

                this.initializeListenersUsedByWS()
            }).catch((error) => {
                this.eventEmitter.send('overlayWs.launchFailed', {
                    args,
                    error
                })
            })
        })

        this.eventEmitter.send('all.ready')
        
    } 

    createScenesAndContent() {
            let scenesListandSourcesData;
            let OBSsources = [];
            this.obsClient.send('GetSceneList').then((arg) => {
                scenesListandSourcesData = arg.scenes
                this.globalConfig.obs.scenesNames.forEach(scene => {
                    let sceneName = `[Echo Overlay] ${scene}`  
                    if(!scenesListandSourcesData.some(obj => obj.name === sceneName)) {
                        this.obsClient.createScene(sceneName)
                    }
                });
                this.obsClient.send('SetTransitionSettings', {transitionName:'Stinger', transitionSettings: {
                    audio_fade_style: 0,
                    path: path.join(__dirname, '../public/assets/transition/transition.mov')
                }})

                this.obsClient.send('SetCurrentTransition', {"transition-name":'Stinger'})

                setTimeout(() => {
                    this.globalConfig.obs.sources.forEach(source => {
                        let settings = {width:1920,height:1080}
                        scenesListandSourcesData.forEach(item => {
                            item.sources.forEach(source => {
                                if(!OBSsources.some(obj => obj.name === source.name)) {
                                    OBSsources.push({name:source.name, type:source.type})
                                }
                            });
                        });
                        
                        source.scene.forEach(scene => {
                            let sceneName = `[Echo Overlay] ${scene.name}`  
                            let index = scenesListandSourcesData.findIndex(obj => obj.name === sceneName)
                            if(scene.data !== undefined) {
                                settings.capture_mode = 'window'
                                settings.window = 'Echo VR:WindowsClass:echovr.exe'
                            }
                            if(source.url !== undefined) {
                                settings.url = source.url
                                settings.restart_when_active = scene.refresh
                            }
                            if(source.type === 'ffmpeg_source') {
                                settings.local_file = path.join(__dirname, source.file),
                                settings.looping = true
                            }
                            if(!OBSsources.some(obj => obj.name === source.name && obj.type === source.type)) {
                                this.obsClient.createSource(source.name, source.type, sceneName, settings)
                            } else {
                                if(index === -1 || scenesListandSourcesData[index].sources.findIndex(obj => obj.name === source.name && obj.type === source.type) === -1) {
                                    this.obsClient.addSourceToScene(sceneName, source.name)
                                }
                            }
                        });
                        
                        setTimeout(() => {
                            source.scene.forEach(scene => {
                                let sceneName = `[Echo Overlay] ${scene.name}`
                                let order = []
                                if(scene.data !== undefined) {
                                    if(scene.data.mute) {
                                        this.obsClient.send('SetMute', {source:source.name, mute:true})
                                    }
                                }
                                
                                if(scene.order !== undefined) {
                                    this.obsClient.send('GetSceneItemList', {sceneName:sceneName}).then((arg) => {
                                        arg.sceneItems.forEach(item => {
                                            if(item.sourceName !== source.name) {
                                                order.push({name:item.sourceName})
                                            }
                                        });

                                        // si la liste est renvoyer a l'envers on la retourne
                                        if(order[order.length-1].name === 'Replay') {
                                            order = order.reverse()
                                        }
                                        
                                        if(scene.order === 'first') {
                                            order = [{name:source.name}].concat(order)
                                        }
                                        
                                        if(scene.order === 'last') {
                                            order.push({name:source.name})
                                        }
                                        this.obsClient.setSourceOrder(sceneName, order)
                                    })
                                }

                                if(scene.data !== undefined) {
                                    this.obsClient.send('SetSceneItemTransform', {
                                        'scene-name': sceneName,
                                        'item': source.name,
                                        "x-scale": scene.data.scaleX,
                                        "y-scale": scene.data.scaleY,
                                        'rotation':0,
                                    })
                                    this.obsClient.send('SetSceneItemPosition', {
                                        'scene-name': sceneName,
                                        'item': source.name,
                                        'x': scene.data.x,
                                        'y': scene.data.y
                                    })
                                    this.obsClient.send('SetSceneItemProperties', {
                                        "scene-name": sceneName,
                                        "item": source.name,
                                        "visible":scene.data.visible
                                    })
                                    
                                    settings = {width:1920,height:1080}
                                }
                            })
                        }, 500);
                    });
                }, 500);
            })
    }

    startEchoVR(executablePath, sessionID) {
        let self = this
        exec(`start /d "${executablePath}" echovr.exe -spectatorstream ${sessionID !== null ? `-lobbyid "${sessionID}"` : ""} ${this.globalConfig.echoArena.settings.anonymous ? "-noovr" : ""} ${this.globalConfig.echoArena.port != 6721 ? `-httpport ${this.globalConfig.echoArena.port} ` : ""} `, (error, stdout, stderr) => { 
            if(error !== null) self.eventEmitter.send('spectate.error', error), console.log(error)
            self.eventEmitter.send('spectate.started')
        });
    }

    initializeListenersUsedByWS() {
        if(this.obsConnectionState) {
            this.obsClient.send('GetSourcesList').then((arg) => {
                arg.sources.forEach(source => {
                    if(source.typeId === 'browser_source') {
                        this.obsClient.refresh(source.name)
                    }
                });
            })
        }
        this.eventEmitter.on('overlay.ready', (args, event) => {
            if(this.globalConfig.vrml.autoLoad) {
                this.overlayWS.send('vrml.matchDataLoaded', this.vrmlInfoWS)
            }
            if(this.obsConnectionState && this.echoArena !== null) {
                this.overlayWS.send('roundData', this.echoArena.rounds)
                this.overlayWS.send('game.updateScore', this.echoArena.scoreData)
            }
        })
    }

    initializeListeners() {
        this.vrmlClient.getSeason().then((data) => {
            this.Allinfo.season = data
        })

        this.eventEmitter.on('vrml.disabled', (args, event) => {
            this.eventEmitter.send('vrml.hide')
        })

        this.eventEmitter.on('obsWebsocket.autoBuffer', (args, event) => {
            this.globalConfig.obs.autoBuffer = args
            this.configLoader.save(this.globalConfig)
        })

        this.eventEmitter.on('scenes.autoStart', (args, event) => {
            this.globalConfig.autoStream.autoStart = {
                ...this.globalConfig.autoStream.autoStart,
                ...args
            }
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('scenes.changed', this.globalConfig.autoStream)
        })

        this.eventEmitter.on('scenes.start', (args, event) => {
            this.globalConfig.autoStream.start = {
                ...this.globalConfig.autoStream.start,
                ...args
            }
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('scenes.changed', this.globalConfig.autoStream)
        })
        
        this.eventEmitter.on('scenes.events', (args, event) => {
            this.globalConfig.autoStream.game = {
                ...this.globalConfig.autoStream.game,
                ...args
            }
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('scenes.changed', this.globalConfig.autoStream)
        })

        this.eventEmitter.on('scenes.end', (args, event) => {
            this.globalConfig.autoStream.end = {
                ...this.globalConfig.autoStream.end,
                ...args
            }
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('scenes.changed', this.globalConfig.autoStream)
        })

        this.eventEmitter.on('obsWebsocket.autoConnect', (args, event) => {
            this.globalConfig.obs.autoConnect = args
            this.configLoader.save(this.globalConfig)
        })

        this.eventEmitter.on('spectate.start', (args, event) => {
            this.startEchoVR(this.globalConfig.echoArena.path, args.id)
            this.spectateStarted = true
        })

        this.eventEmitter.on('echoArena.sessionID', (args, event) => {
            let self = this
            exec('tasklist /FI "imagename eq echovr.exe"', function(err, stdout, stderr) {
                if(stdout.indexOf('echovr.exe') === -1) {
                    self.spectateStarted = false
                } else {
                    self.spectateStarted = true
                }
            });
            
            if(this.globalConfig.echoArena.autoStart && !this.spectateStarted) {
                this.startEchoVR(this.globalConfig.echoArena.path, args.sessionID)
            }

            this.echoArena.setSettingsEchoVR(this.globalConfig.echoArena.settings)
        })

        this.eventEmitter.on('spectate.updateConfig', (args, event) => {
            this.globalConfig.echoArena.settings = {
                ...this.globalConfig.echoArena.settings,
                ...args.settings
            }
            let parts = args.path.split('\\');
            let output = parts.join('/');
            if(output.endsWith('echovr.exe')) {
                output = output.substring(0, output.length - 11);
            }
            if(!output.endsWith('/')) {
                output += '/';
            }
            this.globalConfig.echoArena.path = output
            this.globalConfig.echoArena.autoStart = args.spectateMe
            this.configLoader.save(this.globalConfig)
            this.echoArena.setSettingsEchoVR(this.globalConfig.echoArena.settings)
        })
        

        this.eventEmitter.on('obs.soft', (args, event) => {
            this.globalConfig.obs.autoStart = args.auto
            let parts = args.path.split('\\');
            let output = parts.join('/');
            this.globalConfig.obs.path = output
            this.configLoader.save(this.globalConfig)
        })
        
        this.eventEmitter.on('obsWebsocket.createScenes', (args, event) => {
            this.createScenesAndContent()
            if(this.obsConnectionState) {
                this.obsClient.send('GetSourcesList').then((arg) => {
                    arg.sources.forEach(source => {
                        if(source.typeId === 'browser_source') {
                            this.obsClient.refresh(source.name)
                        }
                    });
                })
            }

        })

        this.eventEmitter.on('obs.start', (args, event) => {
            let executablePath = this.globalConfig.obs.path;
            this.obsClient.isLaunched().then((isLaunched) => {
                if(!isLaunched) {
                    this.obsClient.launch(executablePath)
                }
            })
        })

        this.eventEmitter.on('obsWebsocket.clip', (args, event) => {
            this.globalConfig.autoStream.end = {
                ...this.globalConfig.autoStream.end,
                ...args
            }
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('scenes.changed', this.globalConfig.autoStream)
        })

        this.eventEmitter.on('echoArena.connect', (args, event) => {
            this.connectEchoArena(args).then(() => {
                this.eventEmitter.send('echoArena.connected', args)
                this.globalConfig.echoArena = {
                    ...this.globalConfig.echoArena,
                    ...args,
                }

                this.echoArena.setSettingsEchoVR(this.globalConfig.echoArena.settings)

                this.configLoader.save(this.globalConfig)
                this.obsClient.send('GetSourcesList').then((arg) => {
                    arg.sources.forEach(source => {
                        if(source.typeId === 'browser_source') {
                            this.obsClient.refresh(source.name)
                        }
                    });
                })
            }).catch((error) => {
                this.eventEmitter.send('echoArena.connectionFailed', {
                    args,
                    error
                })
            })
        })

        this.eventEmitter.on('echoArena.edit', (args, event) => {
            this.globalConfig.echoArena.ip = args.ip
            this.globalConfig.echoArena.port = args.port
            this.globalConfig.echoArena.autoConnect = args.autoConnect
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('echoArena.configEdited', this.globalConfig.echoArena)
        })

        

        let ev = events.filter(event => event.customizable)
        this.eventEmitter.send('echoArena.eventsLoaded', {
            events: ev.map(event => event.name)
        }) 

        this.eventEmitter.on('obsWebsocket.connect', (args, event) => {
            this.connectObsWebsocket(args).then(() => {
                this.eventEmitter.send('obsWebsocket.connected', args)
                this.eventHandler = new EventHandler(this.eventEmitter, this.obsClient, this.globalConfig.autoStream)
                this.globalConfig.obs = {
                    ...this.globalConfig.obs,
                    ...args,
                }        
                this.obsClient.send('GetSourcesList').then((arg) => {
                    arg.sources.forEach(source => {
                        if(source.typeId === 'browser_source') {
                            this.obsClient.refresh(source.name)
                        }
                    });
                })
                this.configLoader.save(this.globalConfig)
            }).catch((error) => {
                this.eventEmitter.send('obsWebsocket.connectionFailed', {
                    args,
                    error
                })
            })
        })

        this.eventEmitter.on('obsWebsocket.startStream', (args, event) => {
            this.obsClient.send('StartStreaming').catch((error) => {
                this.eventEmitter.send('obsWebsocket.startStreamFailed', {
                    args,
                    error
                })
            })
        })
    
        this.eventEmitter.on('obsWebsocket.stopStream', (args, event) => {
            this.obsClient.send('StopStreaming').catch((error) => {
                this.eventEmitter.send('obsWebsocket.stopStreamFailed', {
                    args,
                    error
                })
            })
        })

        this.eventEmitter.on('obsWebsocket.startBuffer', (args, event) => {
            this.obsClient.send('GetReplayBufferStatus').then(arg => {
                if(!arg.isReplayBufferActive) {
                    this.obsClient.send("StartReplayBuffer")
                }
            })
            
        })

        this.eventEmitter.on('mixed.customTeam', (args, event) => {
            this.globalConfig.mixed.blue = args.blue
            this.globalConfig.mixed.orange = args.orange
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('mixed.customTeamChanged', this.globalConfig.mixed)
        })

        this.eventEmitter.on('overlayWs.config', (args, event) => {
            this.globalConfig.overlayWs.autoLaunch = args.autoLaunch
            this.globalConfig.overlayWs.port = args.port
            this.configLoader.save(this.globalConfig)
            this.eventEmitter.send('overlayWs.configEdited', this.globalConfig.overlayWs)
        })

        this.eventEmitter.on('vrml.autoLoad', (args, event) => {
            this.globalConfig.vrml.autoLoad = args
            this.configLoader.save(this.globalConfig)
        })

        this.eventEmitter.on('vrml.teamSelected', (args, event) => {
            this.eventEmitter.send('vrml.teamChanged', args)
            this.globalConfig.vrml = {
                ...this.globalConfig.vrml,
                ...args,
            }
            // reset team info
            this.Allinfo = {
                "teams":[],
                "times":[],
                "week":null
            }
            this.configLoader.save(this.globalConfig)
        })

        this.eventEmitter.on('vrml.isVrmlMatch', (args, event) => {
            this.loadMatchDataFromTeam(args.teamId)
        })
        
        this.initializeWS()
        
    }

    loadMatchDataFromTeam(teamId) {

        this.getMatchDataFromTeam(teamId).then((match) => {
            if(this.echoArena !== null) {
                this.echoArena.vrmlInfo = match
            } 
            this.vrmlInfoWS = match
            this.eventEmitter.send('vrml.matchDataLoaded', match)
            
        }).catch(error => {
            this.vrmlInfoWS = this.Allinfo
            this.eventEmitter.send('vrml.matchDataNotFound', {
                teamId: teamId
            })
            
        })
        
    }

    connectObsWebsocket(args) {
        return this.obsClient
            .onConnected((name) => {
                if(this.obsConnectionState !== true) {
                    this.obsConnectionState = true
                    console.log('Connected')
                    setTimeout(() => {
                        this.obsClient.send('GetSceneList').then((scenesData) => {
                            this.eventEmitter.send('scenes.loaded', {
                                scenes: scenesData.scenes.map(scene => scene.name)
                            })
                            this.eventEmitter.send('autoStream.configLoaded', this.globalConfig.autoStream)
                        })
                    }, 1000);
                }
            })
            .onDisconnected((message) => {
                this.obsConnectionState = false
                this.eventEmitter.send('obs.disconnected')
                console.log('Disconnected', message)
            })
        .connect(args)
    }

    async loadTeamList(region) {
        const json = await this.vrmlClient.getTeams()
        const teams = json.filter(team => team.isActive).map((team) => {
            return {
                name: team.teamName,
                id: team.teamID,
            }
        }).sort((a, b) => a.name.localeCompare(b.name))
        this.eventEmitter.send('vrml.teamListLoaded', {
            teams,
            teamId: this.globalConfig.vrml.teamId,
            auto:this.globalConfig.vrml.autoLoad
        })
    }

    async getMatchDataFromTeam(team) {
        const json = await this.vrmlClient.getTeamUpcomingMatches(team)
        
        // reset team info
        this.Allinfo.teams = []

        try {
            this.Allinfo.week = json[0].week
        } catch {}

        json.forEach(element => {
            let dt = new Date(element.dateScheduledUTC)
            if(dt.getDay() === 1 && dt.getHours() === 13) {
                this.Allinfo.times.push('TBD');
            } else {
                // dt.setHours(dt.getHours()+2);
                this.Allinfo.times.push(dt);
            }
        });

        if(this.Allinfo.times.length === 0) {
            throw new Error('no matches found')
        }

        if(this.Allinfo.times.filter(x => x == 'TBD').length === this.Allinfo.times.length) {
            throw new Error('no matches scheduled')
        }

        for(let i = 0; i<this.Allinfo.times.length; i++) {
            if(this.Allinfo.times[i] !== 'TBD') {
                const data = {A:await this.vrmlClient.getTeamPlace(json[i].homeTeam.teamID), B:await this.vrmlClient.getTeamPlace(json[i].awayTeam.teamID)}
                this.Allinfo.teams.push({
                    name: json[i].homeTeam.teamName,
                    rank: json[i].homeTeam.divisionLogo,
                    logo: json[i].homeTeam.teamLogo,
                    link: json[i].homeTeam.teamID,
                    rosters: [],
                    place:data.A.team.rank,
                    color: null
                })
    
                this.Allinfo.teams.push({
                    name: json[i].awayTeam.teamName,
                    rank: json[i].awayTeam.divisionLogo,
                    logo: json[i].awayTeam.teamLogo,
                    link: json[i].awayTeam.teamID,
                    rosters: [],
                    place:data.B.team.rank,
                    color: null
                })
            
                await this.getPlayers()

                // let newDate = new Date()
                // let newDate = new Date(date.getTime()+date.getTimezoneOffset()*60*1000);
                // let offset = date.getTimezoneOffset() / 60;
                // let hours = date.getHours();
                // newDate.setHours(hours - offset);
                
                return {
                    // time: newDate,
                    time: this.Allinfo.times[i],
                    week:this.Allinfo.week,
                    season:this.Allinfo.season,
                    teams: {
                        home: this.Allinfo.teams[0],
                        away: this.Allinfo.teams[1],
                    }
                };
            }
        }
    }

    async getPlayers() {
        let u = 0
        for (let u = 0; u < this.Allinfo.teams.length; u++) {
            const element = this.Allinfo.teams[u]
            const json = await this.vrmlClient.getTeam(element.link)
            json.team.players.map(player => {
                element.rosters.push(player.playerName.toLowerCase())
            });
            if(u >= 2) {
                this.infoState = true
                return
            }
        }
    }
        
    connectEchoArena(config) {
        return new Promise((resolve,reject) => {
            this.echoArena = new EchoArena(config, this.eventEmitter, this.vrmlInfo, this.globalConfig.mixed)
            this.echoArena.listen()
        })
    }

}

module.exports = OBSPlayer

// starting : 1152 658 px
// x 382 y 186

// betwen 1083 599
// 56 71

// main 1920 1080
// 0 0