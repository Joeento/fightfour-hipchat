'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var fs = require('fs');
var PImage = require('pureimage');

var gameSchema = new Schema({
	room_id: String,
	challenger: {type: Schema.Types.ObjectId, ref: 'User'},
	challengee: {type: Schema.Types.ObjectId, ref: 'User'},
	turn: {type: Schema.Types.ObjectId, ref: 'User'},
	board: [[Number]],
	active: {type: 'Boolean', default: true},
	created_at: Date,
	updated_at: Date
});

gameSchema.methods.getDepth = function(slot) {
	if (slot < 0 || slot > this.board[0].length) {
		throw false;
	}
	var depth = -1;
	while (depth + 1 < this.board.length && this.board[depth + 1][slot] === 0) {
		depth++;
	}
	return depth;
};
gameSchema.methods.dropPiece = function(slot, user) {
	

	slot -= 1;
	if (slot < 0 || slot >= this.board[0].length) {
		throw {message: 'Please choose a slot between 1 and 7.'};
	}
	if (this.board[0][slot] !== 0) {
		throw {message: 'That slot is already full.  Try a different one.'};
	}
	
	var depth = this.getDepth(slot);
	var board = this.board;
	board[depth][slot] = this.challenger.equals(user._id) ? 1 : 2;
	this.board = board;
	this.markModified('board');
	this.nextTurn();
	return false;
	
};
gameSchema.methods.checkforWinner = function() {
	var r, c;

    // Check down
    for (r = 0; r < 2; r++)
        for (c = 0; c < 7; c++)
            if (this.checkLine(this.board[r][c], this.board[r+1][c], this.board[r+2][c], this.board[r+3][c]))
                return this.board[r][c];

    // Check right
    for (r = 0; r < 5; r++)
        for (c = 0; c < 4; c++)
            if (this.checkLine(this.board[r][c], this.board[r][c+1], this.board[r][c+2], this.board[r][c+3]))
                return this.board[r][c];

    // Check down-right
    for (r = 0; r < 2; r++)
        for (c = 0; c < 4; c++)
            if (this.checkLine(this.board[r][c], this.board[r+1][c+1], this.board[r+2][c+2], this.board[r+3][c+3]))
                return this.board[r][c];

    // Check down-left
    for (r = 3; r < 5; r++)
        for (c = 0; c < 4; c++)
            if (this.checkLine(this.board[r][c], this.board[r-1][c+1], this.board[r-2][c+2], this.board[r-3][c+3]))
                return this.board[r][c];

    return 0;
};
gameSchema.methods.checkForTie = function() {
	for(var c = 0; c < this.board[0].length; c++) {
		if (this.board[0][c] === 0) {
			return false;
		}
	}
	return true;
};
gameSchema.methods.checkLine = function(a,b,c,d) {
    // Check first cell non-zero and all cells match
    return ((a != 0) && (a ==b) && (a == c) && (a == d));
};
gameSchema.methods.nextTurn = function() {
	if (this.turn.equals(this.challenger)) {
		this.turn = this.challengee;
		return;
	}
	this.turn = this.challenger;
};

gameSchema.methods.generateImage = function(callback) {
	var game = this;
	PImage.decodePNGFromStream(fs.createReadStream('public/img/empty_grid.png')).then(function(input) {
		var output = PImage.make(750, 608);
		var ctx = output.getContext('2d');
		ctx.drawImage(input,
			0, 0, input.width, input.height, // source dimensions
			0, 0, output.width, output.height   // destination dimensions
		);

		var startX = 91;
		var startY = 129.8;
		var distanceX = 96.3;
		var distanceY = 101.5;
		for (var r = 0; r < game.board.length; r++) {
			for (var c = 0; c < game.board[0].length; c++) {
				var colors = ['#FFFFFF', '#FF0000', '#000000'];
				ctx.fillStyle = '#000000';
				ctx.beginPath();
				ctx.arc(startX + (c * distanceX), startY + (r * distanceY), 40, 0, Math.PI*2, true); // Outer circle
				ctx.closePath();
				ctx.fill();

				ctx.fillStyle = colors[game.board[r][c]];
				ctx.beginPath();
				ctx.arc(startX + (c * distanceX), startY + (r * distanceY), 40 -3, 0, Math.PI*2, true); // Outer circle
				ctx.closePath();
				ctx.fill();
			}
		}

		var dir = 'public/grids/';
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}

		dir += game.room_id;
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		
		var file_name = Date.now() + '.png';
		PImage.encodePNGToStream(output,fs.createWriteStream(dir + '/' + file_name)).then(function() {
			callback('grids/' + game.room_id + '/' + file_name);
		});
	});
};

gameSchema.pre('save', function(next) {
    if (this.isNew) {
		this.board = [
			[0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0]
		];
		this.markModified('board');
        this.turn = this.challenger;
    }
    next();
});
gameSchema.pre('save', function(next) {
	var currentDate = new Date();

	this.updated_at = currentDate;

	// if created_at doesn't exist, add to that field
	if (!this.created_at)
		this.created_at = currentDate;

	next();
});

var Game = mongoose.model('Game', gameSchema);

module.exports = Game;