(function (global) {
    "use strict";
    
    //username
    var USERNAME = 'BigBrother';
    //magic numbers
    var EVENT_TYPES = {
          MessagePosted: 1
        , MessageEdited: 2
        , UserEntered: 3
        , UserLeft: 4
        , RoomNameChanged: 5
        , MessageStarred: 6
        , DebugMessage: 7
        , UserMentioned: 8
        , MessageFlagged: 9
        , MessageDeleted: 10
        , FileAdded: 11
        , ModeratorFlag: 12
        , UserSettingsChanged: 13
        , GlobalNotification: 14
        , AccessLevelChanged: 15
        , UserNotification: 16
        , Invitation: 17
        , MessageReply: 18
        , MessageMovedOut: 19
        , MessageMovedIn: 20
        , TimeBreak: 21
        , FeedTicker: 22
        , UserSuspended: 29
        , UserMerged: 30
    };
    var TRANSFORM = {
          1: 'st'
        , 2: 'nd'
        , 3: 'rd'
        , 4: 'th'
        , 5: 'th'
        , 6: 'th'
        , 7: 'th'
        , 8: 'th'
        , 9: 'th'
        , 10: 'th'
    };
    //
    var KEY_WORDS = {
          'codereview': 1
        , 'code': .1
        , 'off-topic': 1
        , 'troll': .5
        , 'review': .5
        , 'stackoverflow': 1
        , 'shit': 1
        , 'crap': 1
        , 'fuck': 1
        , 'arse': 1
        , 'elections': 1
        , 'moderator': 1
        , 'mods': 1
    };
    // storage 
    var key = 'sochatmonitor_data';
    var storage = {
        data: {
            star: [],
            kick: [],
            notable: []
        },
        get: function (name) {
            return storage.data[name];
        },
        clear: function (name) {
            storage.data[name] = [];
        },
        add: function (name, value) {
            if (storage.contains(name, value)) {
                return;
            }
            if (storage.data[name]) {
                Array.prototype.push(storage.data[name], value);
            } else {
                storage.data[name] = [value];
            }
        },
        remove: function (name, value) {
            if (storage.contains(name, value)) {
                return;
            }
            if (storage.data[name]) {
                storage.data[name].remove(value);
            } else {
                storage.data[name] = [];
            }
        },
        save: function () {
            global.localStorage[key] = JSON.stringify(storage.data);
        },
        contains: function(name, value) {
            if (!storage.data[name]){ return false };

            for (var i = 0; i < storage.data[name].length; i++) {
                if (JSON.stringify(storage.data[name][i]) === JSON.stringify(value)) {
                    return true;
                }
            }
            return false;
        },
        load: function () {
            if (!global.localStorage[key]) {
                return;
            }
            storage.data = JSON.parse(global.localStorage[key]);
        }
    };
    storage.load();

    // data collection

    var socket, roomid, url, report, noisy, kickRe;
    
    report = true;
    noisy = true;
    roomid = Number(/\d+/.exec(location)[0]);
    kickRe = /^priv/;
    connect();

    function connect() {
        $.post('/ws-auth', fkey({
            roomid: 8595
        })).done(function (data) {
            url = data.url;
            if (report) console.log('Connected');
            poll();
        });
    }

    function poll() {
        socket = new WebSocket(url + '?l=' + Date.now());
        socket.onmessage = ondata;
        socket.onclose = onclose;
    }

    function ondata(data) {
        var frame = JSON.parse(data.data);
        for (var room in frame) {
            if ('e' in frame[room]) {
                processEvent(frame[room].e[0]);
            }
        }
    }

    function onclose() {
        socket.close();
        socket = null;
        setTimeout(poll, 1000 * 10);
    }
    
    function processMessage(body){
        var sum = 0;
        for (var i = 0, bodyContent = body.toLowerCase().split(' '); i < bodyContent.length; i++){
            if (typeof KEY_WORDS[bodyContent[i]] !== 'undefined'){
                sum += KEY_WORDS[bodyContent[i]];
            }
        }
        return sum >= 1 ? sum : false;
    }

    function processEvent(evt) {
        //console.log(evt);
        switch (evt.event_type) {
            case EVENT_TYPES.MessagePosted:
                //Check if command
                if (USERNAME == evt.user_name){ return; }
                var sum = processMessage(evt.content);
                if (sum >= 1){
                    emit({event_type: 'notable', sum: sum, evt: evt});
                }
                break;
            case EVENT_TYPES.MessageStarred:
                storage.add('star', evt);
                if (report){ console.log('star registered in', evt.room_name); }
                emit(evt);
                break;
        }
        emit(evt);
        storage.save();
    }
    function markdown(value, href){
        return '[' + value + '](' + href + ')';
    }

    function emit(evt) {
        //var kicker = evt.user_name;
        //var kickee_id = evt.target_user_id;
        //var kicked = $('.user-' + kickee_id + ':first .username:first').text() || kickee_id;
        var bodyText;
        var send = false;
        var url = (typeof evt.url !== 'undefined');
        //console.log(evt);
        var afterEffects = function(){};
        switch(evt.event_type){
            case 'welcome':
                bodyText = '*Three minutes hate initialising.*';
                send = true;
                break;
            case 'notable':
                bodyText = ['Notable post detected in', evt.evt.room_name, 'by', evt.evt.user_name + ';', 'Notariety level:', evt.sum].join(' ');
                afterEffects = function(){emit({event_type: 'message', post_id: evt.evt.message_id, url:true})};
                send = true;
                break;
            case EVENT_TYPES.UserEntered:
                bodyText = [
                      evt.user_name
                    , 'joined'
                    , markdown(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)  + '.'
                    , roomid != evt.room_id ? '' : 
                        [
                              'Welcome'
                            , '@' + evt.user_name.replace(' ', '')
                        ].join(', ')
                    ].join(' ');
                send = true;
                break;
            case EVENT_TYPES.UserLeft:
                bodyText = [
                      markdown(evt.user_name, 'http://chat.stackexchange.com/users/' + evt.user_id)
                    , 'left'
                    , markdown(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)
                    ].join(' ');
                send = true;
                break;
            case EVENT_TYPES.MessageStarred:
                var s = 'starred';
                if (typeof evt.message_stars === 'undefined'){
                    s = 'un' + s;
                } else {
                    var starValues = evt.message_stars.toString().split('');
                    s = [
                          'became the'
                        , evt.message_stars + TRANSFORM[starValues[starValues.length - 1]]
                        , 'person to star'
                    ].join(' ');
                }
                bodyText = [
                      evt.user_name
                    , s
                    , markdown('this message', 'http://chat.stackexchange.com/transcript/message/' + evt.message_id)
                    , 'in'
                    , markdown(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)
                    ].join(' ');
                send = true;
                break;
            /*case EVENT_TYPES.MessageReply:
                bodyText = [evt.user_name, 'pinged you in', evt.room_name].join(' ');
                send = true;
                break;*/
            case 'message':
                bodyText = 'http://chat.stackexchange.com/transcript/message/' + evt.post_id;
                send = true;
                break;
        }
        var d = new Date(); 
        var time = [d.getHours(), d.getMinutes(), d.getSeconds()].join(':');
        if (!send){ return;}
        bodyText = url ? bodyText : [time, 'BB>', bodyText].join(' ');
        console.log(bodyText);
        setTimeout(function(){
            $.ajax({
                type: 'POST',
                url: '/chats/' + roomid + '/messages/new',
                data: {
                    fkey: fkey().fkey,
                    text: bodyText
                }
            });
        }, 7000);
        afterEffects();
    }

    global.reporter = {
        welcome: function(){
            emit({event_type: 'welcome'});
        },
        toggle: function(what, hrm) {
            if(!what) return 'you must toggle something';
            switch(what) {
                case 'noisy':
                    noisy = typeof hrm === 'undefined' ? !noisy : !!hrm;
                    return 'noisy is ' + noisy ? 'enabled' : 'disabled';
                break;
                case 'report': 
                    report = typeof hrm === 'undefined' ? !report : !!hrm;
                    return 'report is ' + report ? 'enabled' : 'disabled';
                break
                default: 
                    return 'you cannot toggle that';
                break
            }
        },
        get: function(what) {
            if(!what) return 'you must get something';
            switch(what) {
                case 'kicks':
                case 'kick':
                    return storage.get('kick');
                break;
                case 'stars': 
                case 'star':
                    return storage.get('star');
                break
                case 'users':
                case 'user':
                    return storage.get('rooms');
                break;
                default: 
                    return 'there is no storage for `' + what + '`';
                break
            }
        },
        clear: function(what) {
            if(!what){ return 'you must clear something' };
            switch(what) {
                case 'kicks':
                case 'kick':
                    return storage.clear('kick');
                break;
                case 'stars': 
                case 'star':
                    return storage.clear('star');
                break;
                case 'users':
                    return storage.clear('rooms');
                break;
                default: 
                    return 'there is no storage for `' + what + '`';
                break
            }
            storage.save();
        }
    };

}(window));reporter.welcome();