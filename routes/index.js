var http = require('request');
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');

var User = require('../models/user');
var Game = require('../models/game');

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // simple healthcheck
  app.get('/healthcheck', function (req, res) {
    res.send('OK');
  });

  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  app.get('/',
    function (req, res) {
      // Use content-type negotiation to choose the best way to respond
      res.format({
        // If the request content-type is text-html, it will decide which to serve up
        'text/html': function () {
          var homepage = url.parse(addon.descriptor.links.homepage);
          if (homepage.hostname === req.hostname && homepage.path === req.path) {
            res.render('homepage', addon.descriptor);
          } else {
            res.redirect(addon.descriptor.links.homepage);
          }
        },
        // This logic is here to make sure that the `addon.json` is always
        // served up when requested by the host
        'application/json': function () {
          res.redirect('/atlassian-connect.json');
        }
      });
    }
    );

  // This is an example route that's used by the default for the configuration page
  // https://developer.atlassian.com/hipchat/guide/configuration-page
  app.get('/config',
    // Authenticates the request using the JWT token in the request
    addon.authenticate(),
    function (req, res) {
      // The `addon.authenticate()` middleware populates the following:
      // * req.clientInfo: useful information about the add-on client such as the
      //   clientKey, oauth info, and HipChat account info
      // * req.context: contains the context data accompanying the request like
      //   the roomId
      res.render('config', req.context);
    }
    );

  // This is an example glance that shows in the sidebar
  // https://developer.atlassian.com/hipchat/guide/glances
  app.get('/glance',
    cors(),
    addon.authenticate(),
    function (req, res) {
      res.json({
        "label": {
          "type": "html",
          "value": "Hello World!"
        },
        "status": {
          "type": "lozenge",
          "value": {
            "label": "NEW",
            "type": "error"
          }
        }
      });
    }
    );

  // This is an example end-point that you can POST to to update the glance info
  // Room update API: https://www.hipchat.com/docs/apiv2/method/room_addon_ui_update
  // Group update API: https://www.hipchat.com/docs/apiv2/method/addon_ui_update
  // User update API: https://www.hipchat.com/docs/apiv2/method/user_addon_ui_update
  app.post('/update_glance',
    cors(),
    addon.authenticate(),
    function (req, res) {
      res.json({
        "label": {
          "type": "html",
          "value": "Hello World!"
        },
        "status": {
          "type": "lozenge",
          "value": {
            "label": "All good",
            "type": "success"
          }
        }
      });
    }
    );

  // This is an example sidebar controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/sidebar
  app.get('/sidebar',
    addon.authenticate(),
    function (req, res) {
      res.render('sidebar', {
        identity: req.identity
      });
    }
    );

  // This is an example dialog controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog
  app.get('/dialog',
    addon.authenticate(),
    function (req, res) {
      res.render('dialog', {
        identity: req.identity
      });
    }
    );

  // Sample endpoint to send a card notification back into the chat room
  // See https://developer.atlassian.com/hipchat/guide/sending-messages
  app.post('/send_notification',
    addon.authenticate(),
    function (req, res) {
      var card = {
        "style": "link",
        "url": "https://www.hipchat.com",
        "id": uuid.v4(),
        "title": req.body.messageTitle,
        "description": "Great teams use HipChat: Group and private chat, file sharing, and integrations",
        "icon": {
          "url": "https://hipchat-public-m5.atlassian.com/assets/img/hipchat/bookmark-icons/favicon-192x192.png"
        }
      };
      var msg = '<b>' + card.title + '</b>: ' + card.description;
      var opts = { 'options': { 'color': 'yellow' } };
      hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
      res.json({ status: "ok" });
    }
    );

  app.post('/webhook', addon.authenticate(), function (req, res) {
    var item = req.body.item;
    var command = item.message.message.split(' ');
    switch (command[1]) {
    case 'challenge':
      Game.findOne({
        room_id: item.room.id,
        active: true
      }, function(err, game) {
        if (!game) {
          User.findOne({
            hipchat_id: item.message.from.id,
            hipchat_handle: item.message.from.mention_name
          }, function(err, challenger) {
            if (!challenger) {
              challenger = new User({
                hipchat_id: item.message.from.id,
                hipchat_handle: item.message.from.mention_name,
                name: item.message.from.name,
              });
            }
            challenger.save(function(err) {
              User.findOne({
                hipchat_id: item.message.mentions[0].id,
                hipchat_handle: item.message.mentions[0].mention_name
              }, function(err, challengee) {
                if (!challengee) {
                  challengee = new User({
                    hipchat_id: item.message.mentions[0].id,
                    hipchat_handle: item.message.mentions[0].mention_name,
                    name: item.message.mentions[0].name
                  });
                }
                challengee.save(function(err) {
                  var game = new Game({
                    room_id: item.room.id,
                    challenger: challenger._id,
                    challengee: challengee._id,
                  });
                  game.save(function(err) {
                    hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'The game is on!  Drop checkers in the top slots.  First to get 4 in a row wins!').then(function() {
                      game.generateImage(function(image_url) {
                        hipchat.sendMessage(req.clientInfo, req.identity.roomId, addon.config.localBaseUrl() + '/' + image_url, {options: {
                          format: 'text',
                          color: 'yellow'
                        }}).then(function() {
                          hipchat.sendMessage(req.clientInfo, req.identity.roomId, '@' + challenger.hipchat_handle + ' goes first...', {options: {
                            format: 'text',
                          }}).then(function() {
                            res.sendStatus(200);
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        } else {
          hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Sorry, looks like there\'s another game going on in this room right now.  Please cancel it or try a different room.').then(function() {
            res.sendStatus(200);
          });
        }
      });
      break;
    case 'cancel':
      Game.findOne({
        room_id: item.room.id,
        active: true
      }).populate('challenger').populate('challengee').exec(function(err, game) {
        if (game) {
          game.active = false;
          game.save(function(err) {
            hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Okay, the game between @' + game.challenger.hipchat_handle + ' and @' + game.challengee.hipchat_handle + ' has been cancelled.', {options: {
              format: 'text',
            }}).then(function() {
              res.sendStatus(200);
            });
          });
        } else {
          hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Doesn\'t look like there\'s a game to cancel right now.  Feel free to start one.', {options: {
            format: 'text',
          }}).then(function() {
            res.sendStatus(200);
          });
        }
      });
      break;
    case 'drop':
      Game.findOne({room_id: item.room.id, active: true}, function(err, game) {
        if (err) throw err;
        User.findOne({hipchat_id: item.message.from.id}, function(err, user) {
          try {
            game.dropPiece(command[2], user);
            game.save(function(err) {
              hipchat.sendMessage(req.clientInfo, req.identity.roomId, '@' + item.message.from.mention_name + ' has made a move:', {options: {
                format: 'text',
              }}).then(function() {
                game.generateImage(function(image_url) {
                  hipchat.sendMessage(req.clientInfo, req.identity.roomId, addon.config.localBaseUrl() + '/' + image_url, {options: {
                    format: 'text',
                  }}).then(function() {
                    var winner = game.checkforWinner();
                    var winning_user;
                    if (winner === 1) {
                      winning_user = game.challenger;
                    } else if (winner === 2) {
                      winning_user = game.challengee;
                    }
                    if (winning_user) {
                      game.active = false;
                      game.save(function() {
                        User.findById(winning_user, function(err, user) {
                          hipchat.sendMessage(req.clientInfo, req.identity.roomId, '@' + user.hipchat_handle + ' just won.  Congratulations!!', {options: {
                            format: 'text',
                            color: 'green'
                          }}).then(function() {
                            res.sendStatus(200);
                          });
                        });
                      });
                    } else if (game.checkForTie()) {
                      game.active = false;
                      game.save(function() {
                        hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Looks like a tie.', {options: {
                          format: 'text',
                        }}).then(function() {
                          res.sendStatus(200);
                        });
                      });
                      
                    } else {
                      User.findById(game.turn, function(err, user) {
                        hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Now it\'s @' + user.hipchat_handle + '\'s turn', {options: {
                          format: 'text',
                        }}).then(function() {
                          res.sendStatus(200);
                        });
                      });
                    }
                  });
                });
                
              });
            });
          } catch (err) {
            console.log(err);
            hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Now it\'s @' + user.hipchat_handle + '\'s turn', {options: {
              format: 'text',
              color: 'red'
            }}).then(function() {
              res.sendStatus(200);
            });
            
          }
          
          
        });
      });
      break;
    default:
      hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Unrecognized command.  Try again', {options: {
          color: 'red'
      }}).then(function() {
        res.sendStatus(200);
      });
      break;
    }
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name + ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function (id) {
    addon.settings.client.keys(id + ':*', function (err, rep) {
      rep.forEach(function (k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

};
