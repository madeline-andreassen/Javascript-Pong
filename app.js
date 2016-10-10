// Express Code
var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server started.");

// Global Variables
var SOCKET_LIST = {};
var
WIDTH  = 500,
HEIGHT = 500,
SCORELEFT = 0,
SCORERIGHT = 0;

// Basic Object Constructor
var Entity = function(){
	var self = {
		x:0,
		y:(HEIGHT-100)/2,
		width:20,
		height:100,
		spdY:0,
		id:""
	};
	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		if(self.spdX)
		self.x += self.spdX;
		if(self.spdY)
		self.y += self.spdY;
	}
	return self;
}

// Player Constructor 
var Player = function(id){
	var self = Entity();
	self.id = id;
	self.pressingUp = false;
	self.pressingDown = false;
	self.serveBall = false;
	self.maxSpd = 7;
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		super_update();
		if(self.serveBall){
			SCORELEFT = 0;
			SCORERIGHT = 0;
			delete Ball.list[1];
			var ball = Ball();
			ball.x = self.x;
			ball.y = self.y;
			ball.serve(self.x === 0? 1:-1);
			self.serveBall = false;
		}
	}
	self.updateSpd = function(){
		if(self.pressingUp) self.spdY = -self.maxSpd;
		else if(self.pressingDown) self.spdY = self.maxSpd;
		else self.spdY = 0;		
	}
	Player.list[id] = self;
	return self;
}
// List of all players in game
Player.list = {};
// Recieves player's input and sets states within the player object
Player.onConnect = function(socket){
	var player = Player(socket.id);
	socket.on('serveBallButton', function(){
		player.serveBall = true;
	});
	socket.on('keyPress',function(data){
		if(data.inputId === 'up') player.pressingUp = data.state;
		else if(data.inputId === 'down') player.pressingDown = data.state;
	});
}
// On disconnect, the player is removed from the Player List and the ball stops
Player.onDisconnect = function(socket){
	for(var i in Ball.list){
		var ball = Ball.list[i];
		ball.vel.x=0;
		ball.vel.y=0;
	}
	
	delete Player.list[socket.id];
}
// Updates each player's position
Player.update = function(){
	var pack = [];
	var count = 0;
	for(var i in Player.list){
		var player = Player.list[i];
		if(count % 2 === 0){
			player.x = WIDTH-20;
			player.update();
			pack.push({
				x:WIDTH-20,
				y:player.y,
				width:player.width,
				height:player.height
			});	
		}else{
			player.x=0;
			player.update();
			pack.push({
				x:0,
				y:player.y,
				width:player.width,
				height:player.height
			});	
		}
		count++;
	}
	count = 0;
	return pack;
}

// Ball Constructor
var Ball = function(){
	var self = Entity();
	self.id = 1;
	self.x=20;
	self.y=(HEIGHT-100)/2;
	self.width=20;
	self.height=20;
	self.spdX=0;
	self.spdY=0;
	self.speed = 12;
	self.vel = {
		x: 0,
		y: 0
	};

	var super_update = self.update;
	self.update = function(){
		super_update();
		SCORE++;
		self.x += self.vel.x;
		self.y += self.vel.y;
		//LOOKS TO SEE IF PLAYER AND BALL HAVE COLLIDED
		for(var i in Player.list){
			var p = Player.list[i];
			//HIT PLAYER
			if(p.x < self.x+20 && p.y < self.y+20 && self.x < p.x+p.width && self.y < p.y+p.height) {
				// set the x position and calculate reflection angle
				self.x = p.x === 0 ? 20 : WIDTH-40;
				var n = (self.y + 20 - p.y)/(p.height + 20);
				var phi = 0.25 * Math.PI * (2 * n - 1);
				// calculate smash value and update velocity
				var smash = Math.abs(phi) > 0.2 * Math.PI ? 1.5 : 1;
				self.vel.x = smash * (p.x === 0 ? 1 : -1) * self.speed * Math.cos(phi);
				self.vel.y = smash * self.speed * Math.sin(phi);
			}
		}
		//HIT TOP OF SCREEN, BOUNCES OFF
		if(0 > self.y || self.y + 20 > HEIGHT){
			var offset = self.vel.y < 0 ? 0 - self.y : HEIGHT - (self.y + 20);
			self.y += 2 * offset;
			// mirror the y velocity
			self.vel.y *= -1;
		}
		//OUT ON LEFT
		if(0 > self.x + 20) {
			SCORERIGHT++;
			self.serve(1);
		}
		//OUT ON RIGHT
		else if(self.x > WIDTH) {
			SCORELEFT++;
			self.serve(-1);
		}
	}
	//SERVES THE BALL
	self.serve = function(side) {
		SCORE = 0;
		// set the x and y position
		self.x = (side === 1 ? 40 : WIDTH - 40);
		self.y = (HEIGHT/2);
		// calculate out-angle, higher/lower on the y-axis => steeper angle
		var phi = 0.1 * Math.PI * (1 - 2 * Math.random());
		// set velocity direction and magnitude
		self.vel.x = side * self.speed * Math.cos(phi);
		self.vel.y = self.speed * Math.sin(phi);
	};
	Ball.list[self.id] = self;
	self.serve(1);
	return self;
}
Ball.list = {};
// updates the ball's position
Ball.update = function(){
	var pack = [];
	for(var i in Ball.list){
		var ball = Ball.list[i];
		ball.update();
		pack.push({ 
			x:ball.x, 
			y:ball.y
		});
	}	
	return pack;
}

// Socket IO Code
var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	//LIST OF ALL SOCKETS
	SOCKET_LIST[socket.id] = socket;
	
	Player.onConnect(socket);
	
	//HANDLES DISCONNECTS
	socket.on('disconnect',function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});
	// HANDLES MESSAGES
    socket.on('sendMsgToServer',function(data){
        var playerName = ("" + socket.id).slice(2,7);
        for(var i in SOCKET_LIST){
            SOCKET_LIST[i].emit('addToChat',playerName + ': ' + data);
        }
    });	
});

// Sets the update interval
setInterval(function(){
	// DATA TO BE SENT TO ALL PLAYERS
	var pack = {
		player:Player.update(),
		ball:Ball.update(),
		scoreleft: SCORELEFT,
		scoreright: SCORERIGHT
	}
	// UPDATES ALL PLAYER'S DATA
	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('newPositions',pack);
	}
},1000/25);
