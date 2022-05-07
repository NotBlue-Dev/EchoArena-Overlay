let socket = io();

socket.on('animation.triggerOT', (arg) => {
    animate()
});

function animate() {
    let roundDiv = document.getElementById('roundDiv')
    let disc = document.getElementById('disc')
    let round = document.getElementById('round')
    let discDiv = document.getElementById('discDiv')

    discDiv.classList.add('middle')
    disc.style.animation="spin 2.3s ease 0.1s";
    setTimeout(() => {
        roundDiv.classList.add('opened')
        setTimeout(() => {
            round.classList.remove('hide')
            disc.style.animation="";
        }, 850);
    }, 1500);

    setTimeout(() => {
        roundDiv.classList.add('leave')
        discDiv.classList.remove('middle')
        discDiv.classList.add('goLeft')
        disc.style.animation="spin 2.3s ease 0.1s";
        setTimeout(() => {
            roundDiv.classList.remove('opened')
            roundDiv.classList.add('closed')
            setTimeout(() => {
                round.classList.add('hide')
            }, 150);
        }, 250);
    }, 3500);

    // clear

    setTimeout(() => {
        disc.style.animation="";
        discDiv.classList.add('noDisplay')
        roundDiv.classList.remove('leave')
        discDiv.classList.remove('goLeft')
        setTimeout(() => {
            discDiv.classList.remove('noDisplay')
        }, 1000);
    }, 6000)
}

socket.emit('overlay.ready', {'overlay': 'OT'})