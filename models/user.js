'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
	hipchat_id: {type: 'String', unique: true},
	hipchat_handle: {type: 'String', unique: true},
	room_id: String,
	name: String,
	wins: { type: 'Number', default: 0},
	loses: { type: 'Number', default: 0},
	created_at: Date,
	updated_at: Date
});


userSchema.pre('save', function(next) {
	var currentDate = new Date();

	this.updated_at = currentDate;

	if (!this.created_at)
		this.created_at = currentDate;

	next();
});

var User = mongoose.model('User', userSchema);

module.exports = User;