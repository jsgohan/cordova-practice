/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
*/

// 控制事件调用
// 事件通道pub/sub 作为观察者模式（Observer）的一种变形，很多MV*框架中都提供发布/订阅模型来对代码进行解耦
// 基于该模型提供了一些事件通道，用来控制通道中的事件什么时候以什么样的顺序被调用，以及各个事件通道的调用
// 该代码结构是一个很景点的定义结构（构造函数、实例、修改函数原型共享实例方法）
// 提供事件通道上事件的订阅(subscribe)、撤销订阅（unsubscribe）、调用（fire）。最后发布了8个事件通道
var utils = require('cordova/utils');
var nextGuid = 1;

/**
 * Custom pub-sub "channel" that can have functions subscribed to it
 * This object is used to define and control firing of events for
 * cordova initialization, as well as for custom events thereafter.
 *
 * The order of events during page load and Cordova startup is as follows:
 *
 * onDOMContentLoaded*         Internal event that is received when the web page is loaded and parsed.
 * onNativeReady*              Internal event that indicates the Cordova native side is ready.
 * onCordovaReady*             Internal event fired when all Cordova JavaScript objects have been created.
 * onDeviceReady*              User event fired to indicate that Cordova is ready
 * onResume                    User event fired to indicate a start/resume lifecycle event
 * onPause                     User event fired to indicate a pause lifecycle event
 *
 * The events marked with an * are sticky. Once they have fired, they will stay in the fired state.
 * All listeners that subscribe after the event is fired will be executed right away.
 *
 * The only Cordova events that user code should register for are:
 *      deviceready           Cordova native code is initialized and Cordova APIs can be called from JavaScript
 *      pause                 App has moved to background
 *      resume                App has returned to foreground
 *
 * Listeners can be registered as:
 *      document.addEventListener("deviceready", myDeviceReadyListener, false);
 *      document.addEventListener("resume", myResumeListener, false);
 *      document.addEventListener("pause", myPauseListener, false);
 *
 * The DOM lifecycle events should be used for saving and restoring state
 *      window.onload
 *      window.onunload
 *
 */

/**
 * Channel 1.事件通道的构造函数
 * @constructor
 * @param type  String the channel name
 */
var Channel = function (type, sticky) {
    // 通道名称
    this.type = type;
    // Map of guid -> function.
    // 通道上的所有事件处理函数Map（索引为guid）
    this.handlers = {};
    // 0 = Non-sticky, 1 = Sticky non-fired, 2 = Sticky fired.
    // 通道的状态（0：非sticky，1：sticky但未调用，2：sticky已调用）
    this.state = sticky ? 1 : 0;
    // Used in sticky mode to remember args passed to fire().
    // 对于sticky事件通道备份传给fire()的参数
    this.fireArgs = null;
    // Used by onHasSubscribersChange to know if there are any listeners.
    // 当前通道上的事件处理函数的个数
    this.numHandlers = 0;
    // Function that is called when the first listener is subscribed, or when
    // the last listener is unsubscribed.
    // 订阅第一个时间或者取消订阅最后一个事件时调用自定义的处理
    this.onHasSubscribersChange = null;
};
// 2.事件通道外部接口
var channel = {
    /**
     * Calls the provided function only after all of the channels specified
     * have been fired. All channels must be sticky channels.
     * 把指定的函数h订阅到c的各个通道上，保证h在每个通道的最后被执行
     */
    join: function (h, c) {
        var len = c.length;
        var i = len;
        var f = function () {
            if (!(--i)) h();
        };
        // 把事件处理函数h订阅到c的各个事件通道上
        for (var j = 0; j < len; j++) {
            // 必须是sticky事件通道
            if (c[j].state === 0) {
                throw Error('Can only use join with sticky channels.');
            }
            c[j].subscribe(f);
        }
        // 执行h
        if (!len) h();
    },
    /* eslint-disable no-return-assign */
    // 创建事件通道
    create: function (type) {
        return channel[type] = new Channel(type, false);
    },
    // 创建sticky事件通道
    createSticky: function (type) {
        return channel[type] = new Channel(type, true);
    },
    /* eslint-enable no-return-assign */
    /**
     * cordova Channels that must fire before "deviceready" is fired.
     */
    // 保存deviceready事件之前要调用的事件
    deviceReadyChannelsArray: [],
    deviceReadyChannelsMap: {},

    /**
     * Indicate that a feature needs to be initialized before it is ready to be used.
     * This holds up Cordova's "deviceready" event until the feature has been initialized
     * and Cordova.initComplete(feature) is called.
     * 设置deviceready事件之前必须要完成的事件
     *
     * @param feature {String}     The unique feature name
     */
    waitForInitialization: function (feature) {
        if (feature) {
            var c = channel[feature] || this.createSticky(feature);
            this.deviceReadyChannelsMap[feature] = c;
            this.deviceReadyChannelsArray.push(c);
        }
    },

    /**
     * Indicate that initialization code has completed and the feature is ready to be used.
     * 以前版本的代码，现在好像没有用
     *
     * @param feature {String}     The unique feature name
     */
    initializationComplete: function (feature) {
        var c = this.deviceReadyChannelsMap[feature];
        if (c) {
            c.fire();
        }
    }
};

// 函数的判断校验
function checkSubscriptionArgument (argument) {
    if (typeof argument !== 'function' && typeof argument.handleEvent !== 'function') {
        throw new Error(
            'Must provide a function or an EventListener object ' +
                'implementing the handleEvent interface.'
        );
    }
}

// 3.修改函数原型共享实例方法
/**
 * Subscribes the given function to the channel. Any time that
 * Channel.fire is called so too will the function.
 * Optionally specify an execution context for the function
 * and a guid that can be used to stop subscribing to the channel.
 * Returns the guid.
 * 向事件通道订阅事件处理函数(subscribe部分)
 * eventListenerOrFunction: 事件处理函数 eventListener: 事件的上下文（可省略）
 */
Channel.prototype.subscribe = function (eventListenerOrFunction, eventListener) {
    // 事件处理函数校验
    checkSubscriptionArgument(eventListenerOrFunction);
    var handleEvent, guid;

    if (eventListenerOrFunction && typeof eventListenerOrFunction === 'object') {
        // Received an EventListener object implementing the handleEvent interface
        handleEvent = eventListenerOrFunction.handleEvent;
        eventListener = eventListenerOrFunction;
    } else {
        // Received a function to handle event
        handleEvent = eventListenerOrFunction;
    }

    // 如果是被订阅过的sticky事件，就直接调用
    if (this.state === 2) {
        handleEvent.apply(eventListener || this, this.fireArgs);
        return;
    }

    guid = eventListenerOrFunction.observer_guid;
    // 如果事件有上下文，要先把事件函数包装一下带上上下文
    if (typeof eventListener === 'object') {
        handleEvent = utils.close(eventListener, handleEvent);
    }
    // 自增长的ID
    if (!guid) {
        // First time any channel has seen this subscriber
        guid = '' + nextGuid++;
    }
    // 把自增长的ID反向设置给函数，以后撤销订阅或内部查找用
    handleEvent.observer_guid = guid;
    eventListenerOrFunction.observer_guid = guid;

    // Don't add the same handler more than once.
    // 判断该guid索引的事件处理函数是否存在（保证订阅一次）
    if (!this.handlers[guid]) {
        // 订阅到该通道上（索引为guid）
        this.handlers[guid] = handleEvent;
        // 通道上的事件处理函数的个数增1
        this.numHandlers++;
        if (this.numHandlers === 1) {
            // 订阅第一个事件时调用自定义的处理（比如，第一次按下返回按钮提示“再按一次”）
            this.onHasSubscribersChange && this.onHasSubscribersChange();
        }
    }
};

/**
 * Unsubscribes the function with the given guid from the channel.
 * 撤销订阅通道上的某个函数(guid)
 */
Channel.prototype.unsubscribe = function (eventListenerOrFunction) {
    // 事件处理函数校验
    checkSubscriptionArgument(eventListenerOrFunction);
    var handleEvent, guid, handler;

    if (eventListenerOrFunction && typeof eventListenerOrFunction === 'object') {
        // Received an EventListener object implementing the handleEvent interface
        handleEvent = eventListenerOrFunction.handleEvent;
    } else {
        // Received a function to handle event
        handleEvent = eventListenerOrFunction;
    }
    // 事件处理函数的guid索引
    guid = handleEvent.observer_guid;
    // 事件处理函数
    handler = this.handlers[guid];
    if (handler) {
        // 从该通道上撤销订阅（索引为guid）
        delete this.handlers[guid];
        // 通道上的事件处理函数的个数减1
        this.numHandlers--;
        if (this.numHandlers === 0) {
            // 撤销订阅最后一个事件时调用自定义的处理
            this.onHasSubscribersChange && this.onHasSubscribersChange();
        }
    }
};

/**
 * Calls all functions subscribed to this channel.
 * 调用所有被发布到该通道上的函数
 */
Channel.prototype.fire = function (e) {
    var fail = false; // eslint-disable-line no-unused-vars
    var fireArgs = Array.prototype.slice.call(arguments);
    // Apply stickiness.
    // sticky事件被调用时，标示为已经调用过
    if (this.state === 1) {
        this.state = 2;
        this.fireArgs = fireArgs;
    }
    if (this.numHandlers) {
        // Copy the values first so that it is safe to modify it from within
        // callbacks.
        // 把该通道上的所有事件处理函数拿出来放到一个数组中
        var toCall = [];
        for (var item in this.handlers) {
            toCall.push(this.handlers[item]);
        }
        // 依次调用通道上的所有事件处理函数
        for (var i = 0; i < toCall.length; ++i) {
            toCall[i].apply(this, fireArgs);
        }
        // sticky事件是依次行全部被调用的，调用完成后就清空
        if (this.state === 2 && this.numHandlers) {
            this.numHandlers = 0;
            this.handlers = {};
            this.onHasSubscribersChange && this.onHasSubscribersChange();
        }
    }
};

// 4.创建事件通道（publish部分）
// defining them here so they are ready super fast!
// DOM event that is received when the web page is loaded and parsed.
// （内部事件通道）页面加载后DOM解析完成
channel.createSticky('onDOMContentLoaded');

// Event to indicate the Cordova native side is ready.
// （内部事件通道）Cordova的native准备完成
channel.createSticky('onNativeReady');

// Event to indicate that all Cordova JavaScript objects have been created
// and it's time to run plugin constructors.
// （内部事件通道）所有Cordova的JavaScript对象被创建完成可以开始加载插件
channel.createSticky('onCordovaReady');

// Event to indicate that all automatically loaded JS plugins are loaded and ready.
// FIXME remove this
// （内部时间通道）所有自动load的插件js已经被加载完成
channel.createSticky('onPluginsReady');

// Event to indicate that Cordova is ready
// Cordova全部准备完成
channel.createSticky('onDeviceReady');

// Event to indicate a resume lifecycle event
// 应用重新返回前台
channel.create('onResume');

// Event to indicate a pause lifecycle event
// 应用暂停退到后台
channel.create('onPause');

// 5.设置deviceready事件之前必须要完成的事件
// Channels that must fire before "deviceready" is fired.
// onNativeReady和onPluginsReady是平台初期化之前要完成的
channel.waitForInitialization('onCordovaReady');
channel.waitForInitialization('onDOMContentLoaded');

module.exports = channel;
