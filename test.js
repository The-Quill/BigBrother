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
       MessageStarred: 6
    };
    function convertToMarkdownLink(value, href){
        return '[' + value + '](' + href + ')';
    }
    // storage 
    var key = 'sochatmonitor_data';
    
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function(searchString, position) {
            position = position || 0;
            return this.indexOf(searchString, position) === position;
        };
    }
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

    function processStars(evt){
        console.log(evt);
        storage.modify_stars(evt.user_name, evt.room_name, {post_id: evt.post_id});
    }

    function processEvent(evt) {
        //console.log(evt);
        switch (evt.event_type) {
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
