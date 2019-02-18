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

// 初期处理
var channel = require('cordova/channel');
var cordova = require('cordova');
var modulemapper = require('cordova/modulemapper');
var platform = require('cordova/platform');
var pluginloader = require('cordova/pluginloader');
var utils = require('cordova/utils');

// 定义平台初期化处理必须在onNativeReady和onPluginsReady之后进行
var platformInitChannelsArray = [channel.onNativeReady, channel.onPluginsReady];

// 输出事件通道名到日志
function logUnfiredChannels (arr) {
    for (var i = 0; i < arr.length; ++i) {
        if (arr[i].state !== 2) {
            console.log('Channel not fired: ' + arr[i].type);
        }
    }
}

// 5秒之后deviceready事件还没有被调用将输出log提示
// 出现这个错误的情况比较复杂，比如，加载的plugins太多等
window.setTimeout(function () {
    if (channel.onDeviceReady.state !== 2) {
        console.log('deviceready has not fired after 5 seconds.');
        logUnfiredChannels(platformInitChannelsArray);
        logUnfiredChannels(channel.deviceReadyChannelsArray);
    }
}, 5000);

// Replace navigator before any modules are required(), to ensure it happens as soon as possible.
// We replace it so that properties that can't be clobbered can instead be overridden.
// 替换window.navigator
function replaceNavigator (origNavigator) {
    // 定义新的navigator，把navigator的原型链赋给新的navigator的原型链
    var CordovaNavigator = function () {};
    CordovaNavigator.prototype = origNavigator;
    var newNavigator = new CordovaNavigator();
    // This work-around really only applies to new APIs that are newer than Function.bind.
    // Without it, APIs such as getGamepads() break.
    // 判断是否存在Function.bind函数
    if (CordovaNavigator.bind) {
        for (var key in origNavigator) {
            if (typeof origNavigator[key] === 'function') {
                // 通过bind创建一个新的函数（this指向navigator）后赋给新的navigator
                newNavigator[key] = origNavigator[key].bind(origNavigator);
            } else {
                (function (k) {
                    utils.defineGetterSetter(newNavigator, key, function () {
                        return origNavigator[k];
                    });
                })(key);
            }
        }
    }
    return newNavigator;
}

// 替换webview的DOM对象navigator
// Cordova提供的接口基本都是：navigator.<plugin_name>.<action_name>
if (window.navigator) {
    window.navigator = replaceNavigator(window.navigator);
}

// 定义console.log()
if (!window.console) {
    window.console = {
        log: function () {}
    };
}
// 定义console.warn()
if (!window.console.warn) {
    window.console.warn = function (msg) {
        this.log('warn: ' + msg);
    };
}

// Register pause, resume and deviceready channels as events on document.
// 注册pause，resume，deviceready事件通道，并应用到Cordova自定义的事件拦截
// 这样页面定义的事件监听器就能订阅到响应的通道上了
channel.onPause = cordova.addDocumentEventHandler('pause');
channel.onResume = cordova.addDocumentEventHandler('resume');
channel.onActivated = cordova.addDocumentEventHandler('activated');
channel.onDeviceReady = cordova.addStickyDocumentEventHandler('deviceready');

// Listen for DOMContentLoaded and notify our channel subscribers.
// 如果此时DOM加载完成，触发onDOMContentLoaded事件通道中的事件处理
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    channel.onDOMContentLoaded.fire();
} else {
    // 如果此时DOM没有加载完成，定义一个监听器在DOM完成后触发事件通道的处理
    // 注意这里调用的webview的原生事件监听
    document.addEventListener('DOMContentLoaded', function () {
        channel.onDOMContentLoaded.fire();
    }, false);
}

// _nativeReady is global variable that the native side can set
// to signify that the native code is ready. It is a global since
// it may be called before any cordova JS is ready.
// 此前版本是在CordovaLib中反向执行js把_nativeReady设置成true后触发事件通道
// 现在已经改成在平台启动处理中立即触发
// 参考：https://issues.apache.org/jira/browse/CB-3066
if (window._nativeReady) {
    channel.onNativeReady.fire();
}

// 给常用的模块起个别名
// 比如：就可以直接使用cordova.exec(...)来代替var exec = require('cordova/exec'); exec(...)
// 不过第一行第二个参数应该是"Cordova", c应该大写
modulemapper.clobbers('cordova', 'cordova');
modulemapper.clobbers('cordova/exec', 'cordova.exec');
modulemapper.clobbers('cordova/exec', 'Cordova.exec');

// Call the platform-specific initialization.
// 调用平台初始化启动处理
platform.bootstrap && platform.bootstrap();

// Wrap in a setTimeout to support the use-case of having plugin JS appended to cordova.js.
// The delay allows the attached modules to be defined before the plugin loader looks for them.
// 所有插件加载完成后，触发onPluginsReady事件通道中的事件处理
setTimeout(function () {
    pluginloader.load(function () {
        channel.onPluginsReady.fire();
    });
}, 0);

/**
 * Create all cordova objects once native side is ready.
 * 一旦本地代码准备就绪，创建cordova所需的所有对象
 */
channel.join(function () {
    // 把所有模块附加到window对象上
    modulemapper.mapModules(window);

    // 如果平台有特殊的初始化处理，调用它
    platform.initialize && platform.initialize();

    // Fire event to notify that all objects are created
    // 触发onCordovaReady事件通道，标示cordova准备完成
    channel.onCordovaReady.fire();

    // Fire onDeviceReady event once page has fully loaded, all
    // constructors have run and cordova info has been received from native
    // side.
    // 一切准备就绪后，执行deviceready事件通道上的所有事件
    channel.join(function () {
        require('cordova').fireDocumentEvent('deviceready');
    }, channel.deviceReadyChannelsArray);

}, platformInitChannelsArray); // onNativeReady、onPluginsReady
