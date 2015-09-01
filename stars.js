// ==UserScript==
// @name         BigBrother
// @namespace    MinTru.com
// @version      0.1
// @description  enter something useful. no thanks
// @author       Quill
// @match        http://chat.stackexchange.com/rooms/27369/ministry-of-truth
// @grant        none
// ==/UserScript==

(function (global) {
    "use strict";
    
    //username
    var USERNAME = 'BigBrother';
    var WELCOME_TEXT = '*Three minutes hate initialising.*';
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
        // Custom Event Types
        , Notable: 'notable'
        , Welcome: 'welcome'
    };
    //
    var KEY_WORDS = {
        'off-topic': {
            regex: /(off( |-)topic)/gi,
            value: .4
        },
        'troll':  {
            value: .5
        },
        'shit':  {
            regex: /(s((h|\*)(i|\*))t)/gi,
            value: 1
        },
        'crap':  {
            regex: /(c((r|\*)(a|\*))p)/gi,
            value: 1
        },
        'fuck':  {
            regex: /(f((u|\*)(c|\*))k)/gi,
            value: 1
        },
        'arse':  {
            value: 1
        }
    };
    function convertToMarkdownLink(value, href){
        return '[' + value + '](' + href + ')';
    }
    // storage 
    var key = 'sochatmonitor_data';
    var storage = {
        data: {
            star: [],
            kick: [],
            notable: [],
            users: {}
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
                storage.data[name].push(value);
            } else {
                storage.data[name] = [value];
            }
        },
        modify_stars: function(name, room, value){
            if (!storage.data.users){
                storage.add('users', {});
            }
            if (!(storage.contains('users', name))){
                storage.data.users[name] = {};
            }
            if(!(room in storage.data.users[name])){
                storage.data.users[name][room] = {stars: 20, starred_posts: []};
            }
            storage.data.users[name][room].stars--;
            storage.data.users[name][room].starred_posts.push(value);
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
        for (var i in KEY_WORDS){
            var matchedContent = 0;
            if ('regex' in KEY_WORDS[i]){
                matchedContent = (body.match(KEY_WORDS[i].regex) == null ? 0 : body.match(KEY_WORDS[i].regex).length);
            } else {
                matchedContent = (body.split(' ' + i + ' ').length === 1 ? 0 : body.split(i).length / 2)
            }
            if (matchedContent != 0){
                matchedContent > 0 ? console.log([matchedContent, 'instances of', i].join(' ')) : '';
                sum += matchedContent * KEY_WORDS[i].value;
            }
        }
        return sum >= 1 ? sum : false;
    }
    function processStars(evt){
        console.log(evt);
        storage.modify_stars(evt.user_name, evt.room_name, {post_id: evt.post_id});
    }

    function processEvent(evt) {
        //console.log(evt);
        switch (evt.event_type) {
            case EVENT_TYPES.MessagePosted:
                if (USERNAME == evt.user_name){ return; }
                var sum = processMessage(evt.content);
                if (sum >= 1){
                    storage.add('notable', evt);
                    //emit({event_type: 'notable', sum: sum, evt: evt});
                }
                break;
            case EVENT_TYPES.MessageStarred:
                processStars(evt);
                storage.add('star', evt);
                if (report){ console.log('star registered in', evt.room_name); }
                break;
        }
        //emit(evt);
    }

    function emit(evt) {
        var bodyText = '',
            send     = false;
        //console.log(evt);
        var afterEffects = '';
        switch(evt.event_type){
            case EVENT_TYPES.Welcome:
                bodyText = WELCOME_TEXT;
                send = true;
                break;
            case EVENT_TYPES.Notable:
                bodyText = ['Notable post detected in', evt.evt.room_name, 'by', evt.evt.user_name + ';', 'Notariety level:', evt.sum].join(' ');
                afterEffects = 'http://chat.stackexchange.com/transcript/message/' + evt.evt.message_id;
                send = true;
                break;
            case EVENT_TYPES.UserEntered:
                bodyText = [
                      evt.user_name
                    , 'joined'
                    , convertToMarkdownLink(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)  + '.'
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
                      convertToMarkdownLink(evt.user_name, 'http://chat.stackexchange.com/users/' + evt.user_id)
                    , 'left'
                    , convertToMarkdownLink(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)
                    ].join(' ');
                send = true;
                break;
            case EVENT_TYPES.MessageStarred:
                //console.log(evt);
                bodyText = [
                      evt.user_name
                    , ('message_stars' in evt ? '' : 'un') + 'starred'
                    , convertToMarkdownLink('this message', 'http://chat.stackexchange.com/transcript/message/' + evt.message_id)
                    , 'in'
                    , convertToMarkdownLink(evt.room_name, 'http://chat.stackexchange.com/rooms/' + evt.room_id)
                    ].join(' ');
                send = true;
                break;
            default:
                return;
                break;
        }
        if (!send){ return; }
        var d = new Date(); 
        var time = [d.getHours(), d.getMinutes(), d.getSeconds()].join(':');
        bodyText = [time, 'BB>', bodyText].join(' ');
        console.log(bodyText);
        setTimeout(function(){
            sendMessageToAPI(bodyText);
        }, 5000);
        if (afterEffects != ''){
            setTimeout(function(){
                sendMessageToAPI(afterEffects);
                }, 7000);
        }
        storage.save();
    }
    function sendMessageToAPI(bodyText){
        setTimeout(function(){
            $.ajax({
                type: 'POST',
                url: ['/chats/', roomid, '/messages/new'].join(''),
                data: {
                    fkey: fkey().fkey,
                    text: bodyText
                }
            });
        }, 3000);
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
                break;
            }
            storage.save();
        }
    };

}(window));reporter.welcome();