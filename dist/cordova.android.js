// Platform: android
// 882658ab17740dbdece764e68c1f1f1f44fe3f9d
/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at
 
     http://www.apache.org/licenses/LICENSE-2.0
 
 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/
;(function() {
var PLATFORM_VERSION_BUILD_LABEL = '8.1.0-dev';
// file: src/scripts/require.js

// 模块化系统
// cordova.js中采用的模块化加载fork自almond.js修改实现简易版CommonJS风格的模块系统，同时提供了和node.js之间很好的交互
// 在cordova.js中直接使用define()和require()，在其他文件可以通过cordova.define()和cordova.require()来调用
// 定义2个cordova.js内部使用的全局函数require/define
var require;
var define;

// 通过自调用的匿名函数来实例化全局函数require/define
(function () {
    // 全部模块
    var modules = {};
    // Stack of moduleIds currently being built.
    // 正在build中的模块ID的栈
    var requireStack = [];
    // Map of module ID -> index into requireStack of modules currently being built.
    // 标示正在build中模块ID的Map
    var inProgressModules = {};
    var SEPARATOR = '.';

    // 模块build
    function build (module) {
        // 备份工厂方法
        var factory = module.factory;
        // 对require对象进行特殊处理
        var localRequire = function (id) {
            var resultantId = id;
            // Its a relative path, so lop off the last portion and add the id (minus "./")
            if (id.charAt(0) === '.') {
                resultantId = module.id.slice(0, module.id.lastIndexOf(SEPARATOR)) + SEPARATOR + id.slice(2);
            }
            return require(resultantId);
        };
        // 给模块定义一个空的exports对象，防止工厂类方法中的空引用
        module.exports = {};
        // 删除工厂方法
        delete module.factory;
        // 调用备份的工厂方法(参数必须是require, exports, module)
        factory(localRequire, module.exports, module);
        // 返回工厂方法中实现的module.exports对象
        return module.exports;
    }

    // 加载模块
    require = function (id) {
        // 如果模块不存在抛出异常
        if (!modules[id]) {
            throw 'module ' + id + ' not found';
        // 如果模块正在build中抛出异常
        } else if (id in inProgressModules) {
            var cycle = requireStack.slice(inProgressModules[id]).join('->') + '->' + id;
            throw 'Cycle in require graph: ' + cycle;
        }
        // 如果模块存在工厂方法说明还未进行build(require嵌套)
        if (modules[id].factory) {
            try {
                // 标示该模块正在build
                inProgressModules[id] = requireStack.length;
                // 将该模块压入请求栈
                requireStack.push(id);
                // 模块build，成功后返回module.exports
                return build(modules[id]);
            } finally {
                // build完成后删除当前请求
                delete inProgressModules[id];
                requireStack.pop();
            }
        }
        // build完的模块直接返回module.exports
        return modules[id].exports;
    };

    // 定义模块
    define = function (id, factory) {
        // 如果已经存在抛出异常
        if (modules[id]) {
            throw 'module ' + id + ' already defined';
        }

        // 模块以ID为索引包含ID和工厂方法
        modules[id] = {
            id: id,
            factory: factory
        };
    };

    // 移除模块
    define.remove = function (id) {
        delete modules[id];
    };

    // 返回所有模块
    define.moduleMap = modules;
})();

// Export for use in node
// 如果处于nodejs环境的话，把require/define暴露给外部
if (typeof module === 'object' && typeof require === 'function') {
    module.exports.require = require;
    module.exports.define = define;
}

// file: src/cordova.js
define("cordova", function(require, exports, module) {

// 事件的处理和回调，外部访问cordova.js的入口
// 基于事件通道提供了整体的事件拦截控制及回调
// Workaround for Windows 10 in hosted environment case
// http://www.w3.org/html/wg/drafts/html/master/browsers.html#named-access-on-the-window-object
if (window.cordova && !(window.cordova instanceof HTMLElement)) { // eslint-disable-line no-undef
    throw new Error('cordova already defined');
}

// 调用通道和平台模块
var channel = require('cordova/channel');
var platform = require('cordova/platform');

/**
 * Intercept calls to addEventListener + removeEventListener and handle deviceready,
 * resume, and pause events.
 * 备份document和window的事件监听器
 */
var m_document_addEventListener = document.addEventListener;
var m_document_removeEventListener = document.removeEventListener;
var m_window_addEventListener = window.addEventListener;
var m_window_removeEventListener = window.removeEventListener;

/**
 * Houses custom event handlers to intercept on document + window event listeners.
 * 保存自定义的document和window的事件监听器
 */
var documentEventHandlers = {};
var windowEventHandlers = {};

// 拦截document和window的事件监听器（addEventListener/removeEventListener）
// 存在自定义的事件监听器的话，使用自定义的；不存在的话调用备份document和window的事件监听器
document.addEventListener = function (evt, handler, capture) {
    var e = evt.toLowerCase();
    if (typeof documentEventHandlers[e] !== 'undefined') {
        documentEventHandlers[e].subscribe(handler);
    } else {
        m_document_addEventListener.call(document, evt, handler, capture);
    }
};

window.addEventListener = function (evt, handler, capture) {
    var e = evt.toLowerCase();
    if (typeof windowEventHandlers[e] !== 'undefined') {
        windowEventHandlers[e].subscribe(handler);
    } else {
        m_window_addEventListener.call(window, evt, handler, capture);
    }
};

document.removeEventListener = function (evt, handler, capture) {
    var e = evt.toLowerCase();
    // If unsubscribing from an event that is handled by a plugin
    if (typeof documentEventHandlers[e] !== 'undefined') {
        documentEventHandlers[e].unsubscribe(handler);
    } else {
        m_document_removeEventListener.call(document, evt, handler, capture);
    }
};

window.removeEventListener = function (evt, handler, capture) {
    var e = evt.toLowerCase();
    // If unsubscribing from an event that is handled by a plugin
    if (typeof windowEventHandlers[e] !== 'undefined') {
        windowEventHandlers[e].unsubscribe(handler);
    } else {
        m_window_removeEventListener.call(window, evt, handler, capture);
    }
};

// 创建一个指定type的事件
// 参考: https://developer.mozilla.org/en-US/docs/Web/API/document.createEvent#Notes
function createEvent (type, data) {
    var event = document.createEvent('Events');
    // 指定事件名、不可冒泡、不可取消
    event.initEvent(type, false, false);
    // 自定义数据
    if (data) {
        for (var i in data) {
            if (data.hasOwnProperty(i)) {
                event[i] = data[i];
            }
        }
    }
    return event;
}

/* eslint-disable no-undef */
// 外部访问dordova.js的入口
var cordova = {
    // 模块系统
    define: define,
    require: require,
    // 版本号和平台号
    version: PLATFORM_VERSION_BUILD_LABEL,
    platformVersion: PLATFORM_VERSION_BUILD_LABEL,
    platformId: platform.id,

    /* eslint-enable no-undef */

    /**
     * Methods to add/remove your own addEventListener hijacking on document + window.
     * 为了拦截document和window的事件监听器，添加或删除自定义的事件监听器
     */
    addWindowEventHandler: function (event) {
        return (windowEventHandlers[event] = channel.create(event));
    },
    // sticky是指一旦被调用那么它以后都保持被调用的状态，所定义的监听器会被立即执行
    // 比如：deviceready事件只触发一次，以后的所有监听都是立即执行的
    addStickyDocumentEventHandler: function (event) {
        return (documentEventHandlers[event] = channel.createSticky(event));
    },
    addDocumentEventHandler: function (event) {
        return (documentEventHandlers[event] = channel.create(event));
    },
    removeWindowEventHandler: function (event) {
        delete windowEventHandlers[event];
    },
    removeDocumentEventHandler: function (event) {
        delete documentEventHandlers[event];
    },
    /**
     * Retrieve original event handlers that were replaced by Cordova
     * 获取拦截前的document和window的事件监听器
     * @return object
     */
    getOriginalHandlers: function () {
        return {'document': {'addEventListener': m_document_addEventListener, 'removeEventListener': m_document_removeEventListener},
            'window': {'addEventListener': m_window_addEventListener, 'removeEventListener': m_window_removeEventListener}};
    },
    /**
     * Method to fire event from native code
     * bNoDetach is required for events which cause an exception which needs to be caught in native code
     * 调用document的事件
     */
    fireDocumentEvent: function (type, data, bNoDetach) {
        var evt = createEvent(type, data);
        if (typeof documentEventHandlers[type] !== 'undefined') {
            // 判断是否需要抛出事件异常
            if (bNoDetach) {
                // 通过Channel的fire方法来调用事件（apply）
                documentEventHandlers[type].fire(evt);
            } else {
                // setTimeout(callback, 0)表示在DOM构成完毕、事件监听器执行完成后立即执行
                setTimeout(function () {
                    // Fire deviceready on listeners that were registered before cordova.js was loaded.
                    if (type === 'deviceready') {
                        document.dispatchEvent(evt);
                    }
                    // 通过Channel的fire方法来调用事件(apply)
                    documentEventHandlers[type].fire(evt);
                }, 0);
            }
        } else {
            // 直接调用事件
            document.dispatchEvent(evt);
        }
    },
    // 调用window的事件
    fireWindowEvent: function (type, data) {
        var evt = createEvent(type, data);
        if (typeof windowEventHandlers[type] !== 'undefined') {
            setTimeout(function () {
                windowEventHandlers[type].fire(evt);
            }, 0);
        } else {
            window.dispatchEvent(evt);
        }
    },

    /**
     * Plugin callback mechanism.
     * 插件回调相关
     */
    // Randomize the starting callbackId to avoid collisions after refreshing or navigating.
    // This way, it's very unlikely that any new callback would get the same callbackId as an old callback.
    // 回调ID中间的一个随机数(真正的ID：插件名+随机数)
    callbackId: Math.floor(Math.random() * 2000000000),
    // 回调函数对象，比如success，fail
    callbacks: {},
    // 回调状态
    callbackStatus: {
        NO_RESULT: 0,
        OK: 1,
        CLASS_NOT_FOUND_EXCEPTION: 2,
        ILLEGAL_ACCESS_EXCEPTION: 3,
        INSTANTIATION_EXCEPTION: 4,
        MALFORMED_URL_EXCEPTION: 5,
        IO_EXCEPTION: 6,
        INVALID_ACTION: 7,
        JSON_EXCEPTION: 8,
        ERROR: 9
    },

    /**
     * Called by native code when returning successful result from an action.
     * 以后使用callbackFromNative代替callbackSuccess和callbackError
     */
    callbackSuccess: function (callbackId, args) {
        cordova.callbackFromNative(callbackId, true, args.status, [args.message], args.keepCallback);
    },

    /**
     * Called by native code when returning error result from an action.
     */
    callbackError: function (callbackId, args) {
        // TODO: Deprecate callbackSuccess and callbackError in favour of callbackFromNative.
        // Derive success from status.
        cordova.callbackFromNative(callbackId, false, args.status, [args.message], args.keepCallback);
    },

    /**
     * Called by native code when returning the result from an action.
     * 调用回调函数
     */
    callbackFromNative: function (callbackId, isSuccess, status, args, keepCallback) {
        try {
            var callback = cordova.callbacks[callbackId];
            // 判断是否定义了回调函数
            if (callback) {
                if (isSuccess && status === cordova.callbackStatus.OK) {
                    // 调用success函数
                    callback.success && callback.success.apply(null, args);
                } else if (!isSuccess) {
                    // 调用fail函数
                    callback.fail && callback.fail.apply(null, args);
                }
                /*
                else
                    Note, this case is intentionally not caught.
                    this can happen if isSuccess is true, but callbackStatus is NO_RESULT
                    which is used to remove a callback from the list without calling the callbacks
                    typically keepCallback is false in this case
                */
                // Clear callback if not expecting any more results
                // 如果设置成不再保持回调，删除回调函数对象
                if (!keepCallback) {
                    delete cordova.callbacks[callbackId];
                }
            }
        } catch (err) {
            var msg = 'Error in ' + (isSuccess ? 'Success' : 'Error') + ' callbackId: ' + callbackId + ' : ' + err;
            console && console.log && console.log(msg);
            console && console.log && err.stack && console.log(err.stack);
            cordova.fireWindowEvent('cordovacallbackerror', { 'message': msg });
            throw err;
        }
    },
    // 没有地方使用到
    // 目的是把你自己的函数注入到Cordova的生命周期中
    addConstructor: function (func) {
        channel.onCordovaReady.subscribe(function () {
            try {
                func();
            } catch (e) {
                console.log('Failed to run constructor: ' + e);
            }
        });
    }
};

module.exports = cordova;

});

// file: /Users/admin/repo/vuerepo/cordova-android/cordova-js-src/android/nativeapiprovider.js
define("cordova/android/nativeapiprovider", function(require, exports, module) {

/**
 * Exports the ExposedJsApi.java object if available, otherwise exports the PromptBasedNativeApi.
 * Native的具体交互形式
 */

 // WebView中是否通过addJavascriptInterface提供了访问ExposedJsApi.java的_cordovaNative对象
 // 如果不存在选择prompt()形式的交互方式
var nativeApi = this._cordovaNative || require('cordova/android/promptbasednativeapi');
var currentApi = nativeApi;

module.exports = {
    // 获取当前交互方式
    get: function() { return currentApi; },
    // 设置使用prompt()交互方式
    // (true: prompt false: 自动选择)
    setPreferPrompt: function(value) {
        currentApi = value ? require('cordova/android/promptbasednativeapi') : nativeApi;
    },
    // Used only by tests.
    // 直接设置交互方式对象（很少用到）
    set: function(value) {
        currentApi = value;
    }
};

});

// file: /Users/admin/repo/vuerepo/cordova-android/cordova-js-src/android/promptbasednativeapi.js
define("cordova/android/promptbasednativeapi", function(require, exports, module) {

/**
 * Implements the API of ExposedJsApi.java, but uses prompt() to communicate.
 * This is used pre-JellyBean, where addJavascriptInterface() is disabled.
 * 通过prompt()和Native交互（Android2.3 simulator的Bug）
 * 由于Android2.3模拟器存在Bug，不支持addJavascriptInterface()
 * 所以借助prompt()来和Native进行交互
 * Native端会在CordovaChromeClient.onJsPrompt()中拦截处理
 */

module.exports = {
    // 调用Native API
    exec: function(bridgeSecret, service, action, callbackId, argsJson) {
        return prompt(argsJson, 'gap:'+JSON.stringify([bridgeSecret, service, action, callbackId]));
    },
    // 设置Native->JS的桥接模式
    setNativeToJsBridgeMode: function(bridgeSecret, value) {
        prompt(value, 'gap_bridge_mode:' + bridgeSecret);
    },
    // 接收消息
    retrieveJsMessages: function(bridgeSecret, fromOnlineEvent) {
        return prompt(+fromOnlineEvent, 'gap_poll:' + bridgeSecret);
    }
};

});

// file: src/common/argscheck.js
define("cordova/argscheck", function(require, exports, module) {

// 用于plugin中校验参数，比如argscheck.checkArgs('fFO', 'Camera.getPicture', arguments); 参数应该是2个函数1个对象
var utils = require('cordova/utils');

var moduleExports = module.exports;

var typeMap = {
    'A': 'Array',
    'D': 'Date',
    'N': 'Number',
    'S': 'String',
    'F': 'Function',
    'O': 'Object'
};

function extractParamName (callee, argIndex) {
    return (/.*?\((.*?)\)/).exec(callee)[1].split(', ')[argIndex];
}

function checkArgs (spec, functionName, args, opt_callee) {
    if (!moduleExports.enableChecks) {
        return;
    }
    var errMsg = null;
    var typeName;
    for (var i = 0; i < spec.length; ++i) {
        var c = spec.charAt(i);
        var cUpper = c.toUpperCase();
        var arg = args[i];
        // Asterix means allow anything.
        if (c === '*') {
            continue;
        }
        typeName = utils.typeName(arg);
        if ((arg === null || arg === undefined) && c === cUpper) {
            continue;
        }
        if (typeName !== typeMap[cUpper]) {
            errMsg = 'Expected ' + typeMap[cUpper];
            break;
        }
    }
    if (errMsg) {
        errMsg += ', but got ' + typeName + '.';
        errMsg = 'Wrong type for parameter "' + extractParamName(opt_callee || args.callee, i) + '" of ' + functionName + ': ' + errMsg;
        // Don't log when running unit tests.
        if (typeof jasmine === 'undefined') {
            console.error(errMsg);
        }
        throw TypeError(errMsg);
    }
}

function getValue (value, defaultValue) {
    return value === undefined ? defaultValue : value;
}

moduleExports.checkArgs = checkArgs;
moduleExports.getValue = getValue;
moduleExports.enableChecks = true;

});

// file: src/common/base64.js
define("cordova/base64", function(require, exports, module) {

// JS->Native交互时对ArrayBuffer进行uint8ToBase64(WebSockets二进制流)
var base64 = exports;

base64.fromArrayBuffer = function (arrayBuffer) {
    var array = new Uint8Array(arrayBuffer);
    return uint8ToBase64(array);
};

base64.toArrayBuffer = function (str) {
    var decodedStr = typeof atob !== 'undefined' ? atob(str) : Buffer.from(str, 'base64').toString('binary'); // eslint-disable-line no-undef
    var arrayBuffer = new ArrayBuffer(decodedStr.length);
    var array = new Uint8Array(arrayBuffer);
    for (var i = 0, len = decodedStr.length; i < len; i++) {
        array[i] = decodedStr.charCodeAt(i);
    }
    return arrayBuffer;
};

// ------------------------------------------------------------------------------

/* This code is based on the performance tests at http://jsperf.com/b64tests
 * This 12-bit-at-a-time algorithm was the best performing version on all
 * platforms tested.
 */

var b64_6bit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var b64_12bit;

var b64_12bitTable = function () {
    b64_12bit = [];
    for (var i = 0; i < 64; i++) {
        for (var j = 0; j < 64; j++) {
            b64_12bit[i * 64 + j] = b64_6bit[i] + b64_6bit[j];
        }
    }
    b64_12bitTable = function () { return b64_12bit; };
    return b64_12bit;
};

function uint8ToBase64 (rawData) {
    var numBytes = rawData.byteLength;
    var output = '';
    var segment;
    var table = b64_12bitTable();
    for (var i = 0; i < numBytes - 2; i += 3) {
        segment = (rawData[i] << 16) + (rawData[i + 1] << 8) + rawData[i + 2];
        output += table[segment >> 12];
        output += table[segment & 0xfff];
    }
    if (numBytes - i === 2) {
        segment = (rawData[i] << 16) + (rawData[i + 1] << 8);
        output += table[segment >> 12];
        output += b64_6bit[(segment & 0xfff) >> 6];
        output += '=';
    } else if (numBytes - i === 1) {
        segment = (rawData[i] << 16);
        output += table[segment >> 12];
        output += '==';
    }
    return output;
}

});

// file: src/common/builder.js
define("cordova/builder", function(require, exports, module) {

// 对象属性操作，比如把一个对象的属性merge到另外一个对象
var utils = require('cordova/utils');

function each (objects, func, context) {
    for (var prop in objects) {
        if (objects.hasOwnProperty(prop)) {
            func.apply(context, [objects[prop], prop]);
        }
    }
}

function clobber (obj, key, value) {
    exports.replaceHookForTesting(obj, key);
    var needsProperty = false;
    try {
        obj[key] = value;
    } catch (e) {
        needsProperty = true;
    }
    // Getters can only be overridden by getters.
    if (needsProperty || obj[key] !== value) {
        utils.defineGetter(obj, key, function () {
            return value;
        });
    }
}

function assignOrWrapInDeprecateGetter (obj, key, value, message) {
    if (message) {
        utils.defineGetter(obj, key, function () {
            console.log(message);
            delete obj[key];
            clobber(obj, key, value);
            return value;
        });
    } else {
        clobber(obj, key, value);
    }
}

function include (parent, objects, clobber, merge) {
    each(objects, function (obj, key) {
        try {
            var result = obj.path ? require(obj.path) : {};

            if (clobber) {
                // Clobber if it doesn't exist.
                if (typeof parent[key] === 'undefined') {
                    assignOrWrapInDeprecateGetter(parent, key, result, obj.deprecated);
                } else if (typeof obj.path !== 'undefined') {
                    // If merging, merge properties onto parent, otherwise, clobber.
                    if (merge) {
                        recursiveMerge(parent[key], result);
                    } else {
                        assignOrWrapInDeprecateGetter(parent, key, result, obj.deprecated);
                    }
                }
                result = parent[key];
            } else {
                // Overwrite if not currently defined.
                if (typeof parent[key] === 'undefined') {
                    assignOrWrapInDeprecateGetter(parent, key, result, obj.deprecated);
                } else {
                    // Set result to what already exists, so we can build children into it if they exist.
                    result = parent[key];
                }
            }

            if (obj.children) {
                include(result, obj.children, clobber, merge);
            }
        } catch (e) {
            utils.alert('Exception building Cordova JS globals: ' + e + ' for key "' + key + '"');
        }
    });
}

/**
 * Merge properties from one object onto another recursively.  Properties from
 * the src object will overwrite existing target property.
 *
 * @param target Object to merge properties into.
 * @param src Object to merge properties from.
 */
function recursiveMerge (target, src) {
    for (var prop in src) {
        if (src.hasOwnProperty(prop)) {
            if (target.prototype && target.prototype.constructor === target) {
                // If the target object is a constructor override off prototype.
                clobber(target.prototype, prop, src[prop]);
            } else {
                if (typeof src[prop] === 'object' && typeof target[prop] === 'object') {
                    recursiveMerge(target[prop], src[prop]);
                } else {
                    clobber(target, prop, src[prop]);
                }
            }
        }
    }
}

exports.buildIntoButDoNotClobber = function (objects, target) {
    include(target, objects, false, false);
};
exports.buildIntoAndClobber = function (objects, target) {
    include(target, objects, true, false);
};
exports.buildIntoAndMerge = function (objects, target) {
    include(target, objects, true, true);
};
exports.recursiveMerge = recursiveMerge;
exports.assignOrWrapInDeprecateGetter = assignOrWrapInDeprecateGetter;
exports.replaceHookForTesting = function () {};

});

// file: src/common/channel.js
define("cordova/channel", function(require, exports, module) {

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

});

// file: /Users/admin/repo/vuerepo/cordova-android/cordova-js-src/exec.js
define("cordova/exec", function(require, exports, module) {

/**
 * Execute a cordova command.  It is up to the native side whether this action
 * is synchronous or asynchronous.  The native side can return:
 *      Synchronous: PluginResult object as a JSON string
 *      Asynchronous: Empty string ""
 * If async, the native side will cordova.callbackSuccess or cordova.callbackError,
 * depending upon the result of the action.
 * 执行JS->Native交互
 *
 * @param {Function} success    The success callback
 * @param {Function} fail       The fail callback
 * @param {String} service      The name of the service to use
 * @param {String} action       Action to be run in cordova
 * @param {String[]} [args]     Zero or more arguments to pass to the method
 */
var cordova = require('cordova'),
    nativeApiProvider = require('cordova/android/nativeapiprovider'),
    utils = require('cordova/utils'),
    base64 = require('cordova/base64'),
    channel = require('cordova/channel'),
    // JS->Native的可选交互形式一览
    jsToNativeModes = {
        // 基于prompt()的交互
        PROMPT: 0,
        // 基于JavascriptInterface的交互
        JS_OBJECT: 1
    },
    // Native->JS的可选交互形式一览
    nativeToJsModes = {
        // Polls for messages using the JS->Native bridge.
        // 轮询（JS->Native自动获取消息）
        POLLING: 0,
        // For LOAD_URL to be viable, it would need to have a work-around for
        // the bug where the soft-keyboard gets dismissed when a message is sent.
        // 使用webView.loadUrl("javascript:")来执行消息
        // 解决软键盘的Bug
        LOAD_URL: 1,
        // For the ONLINE_EVENT to be viable, it would need to intercept all event
        // listeners (both through addEventListener and window.ononline) as well
        // as set the navigator property itself.
        // 拦截事件监听，使用online/offline事件来告诉JS获取消息
        // 默认值NativeToJsMessageQueue.DEFAULT_BRIDGE_MODE=2
        ONLINE_EVENT: 2,
        // 反射WebView的私有API来执行JS(需要Android 3.2.4以上版本)
        EVAL_BRIDGE: 3
    },
    // 当前JS->Native的交互形式
    jsToNativeBridgeMode,  // Set lazily.
    // 当前Native->JS的交互形式
    nativeToJsBridgeMode = nativeToJsModes.EVAL_BRIDGE,
    pollEnabled = false,
    bridgeSecret = -1;

var messagesFromNative = [];
var isProcessing = false;
var resolvedPromise = typeof Promise == 'undefined' ? null : Promise.resolve();
var nextTick = resolvedPromise ? function(fn) { resolvedPromise.then(fn); } : function(fn) { setTimeout(fn); };

// 执行Cordova提供的API
// 比如：exec(successCallback, errorCallback, "Camera", "takePicture", args);
function androidExec(success, fail, service, action, args) {
    if (bridgeSecret < 0) {
        // If we ever catch this firing, we'll need to queue up exec()s
        // and fire them once we get a secret. For now, I don't think
        // it's possible for exec() to be called since plugins are parsed but
        // not run until until after onNativeReady.
        throw new Error('exec() called without bridgeSecret');
    }
    // Set default bridge modes if they have not already been set.
    // By default, we use the failsafe, since addJavascriptInterface breaks too often
    // 默认采用JavascriptInterface交互方式
    if (jsToNativeBridgeMode === undefined) {
        androidExec.setJsToNativeBridgeMode(jsToNativeModes.JS_OBJECT);
    }

    // If args is not provided, default to an empty array
    args = args || [];

    // Process any ArrayBuffers in the args into a string.
    // 如果参数中存在ArrayBuffer类型的参数，转换成字符串
    for (var i = 0; i < args.length; i++) {
        if (utils.typeName(args[i]) == 'ArrayBuffer') {
            args[i] = base64.fromArrayBuffer(args[i]);
        }
    }

    var callbackId = service + cordova.callbackId++,
        // 把所有参数转换成JSON串
        argsJson = JSON.stringify(args);
    // 设置回调函数
    if (success || fail) {
        cordova.callbacks[callbackId] = {success:success, fail:fail};
    }
    
    // 默认是同步的，返回PluginResult对象的JSON串。异步的话msgs为空
    // Java端JavascriptInterface定义的_cordovaNative也有和promptbasednativeapi.js相同的方法
    // 因为默认执行用JavascriptInterface交互，因此此时被Java端拦截
    // 如果返回为'@Null arguments'代表失败，需要切换成prompt再来一次
    var msgs = nativeApiProvider.get().exec(bridgeSecret, service, action, callbackId, argsJson);
    // If argsJson was received by Java as null, try again with the PROMPT bridge mode.
    // This happens in rare circumstances, such as when certain Unicode characters are passed over the bridge on a Galaxy S2.  See CB-2666.
    if (jsToNativeBridgeMode == jsToNativeModes.JS_OBJECT && msgs === "@Null arguments.") {
        // 如果参数被传递到Java端，但是接收到的是null，切换交互方式到prompt()再执行一次
        // 参考 https://issues.apache.org/jira/browse/CB-2666
        androidExec.setJsToNativeBridgeMode(jsToNativeModes.PROMPT);
        androidExec(success, fail, service, action, args);
        // 执行完成后，把交互方式再切回JavascriptInterface
        androidExec.setJsToNativeBridgeMode(jsToNativeModes.JS_OBJECT);
    } else if (msgs) {
        messagesFromNative.push(msgs);
        // Always process async to avoid exceptions messing up stack.
        // 处理Native返回的消息
        nextTick(processMessages);
    }
}

androidExec.init = function() {
    bridgeSecret = +prompt('', 'gap_init:' + nativeToJsBridgeMode);
    channel.onNativeReady.fire();
};

function pollOnceFromOnlineEvent() {
    pollOnce(true);
}

// 从Native的消息队列中获取消息
function pollOnce(opt_fromOnlineEvent) {
    if (bridgeSecret < 0) {
        // This can happen when the NativeToJsMessageQueue resets the online state on page transitions.
        // We know there's nothing to retrieve, so no need to poll.
        return;
    }
    var msgs = nativeApiProvider.get().retrieveJsMessages(bridgeSecret, !!opt_fromOnlineEvent);
    if (msgs) {
        messagesFromNative.push(msgs);
        // Process sync since we know we're already top-of-stack.
        processMessages();
    }
}

function pollingTimerFunc() {
    if (pollEnabled) {
        pollOnce();
        setTimeout(pollingTimerFunc, 50);
    }
}

function hookOnlineApis() {
    function proxyEvent(e) {
        cordova.fireWindowEvent(e.type);
    }
    // The network module takes care of firing online and offline events.
    // It currently fires them only on document though, so we bridge them
    // to window here (while first listening for exec()-releated online/offline
    // events).
    window.addEventListener('online', pollOnceFromOnlineEvent, false);
    window.addEventListener('offline', pollOnceFromOnlineEvent, false);
    cordova.addWindowEventHandler('online');
    cordova.addWindowEventHandler('offline');
    document.addEventListener('online', proxyEvent, false);
    document.addEventListener('offline', proxyEvent, false);
}

// 添加online/offline事件
hookOnlineApis();

// 外部可以访问到交互方式的常量
androidExec.jsToNativeModes = jsToNativeModes;
androidExec.nativeToJsModes = nativeToJsModes;

// 设置JS->Native的交互方式
androidExec.setJsToNativeBridgeMode = function(mode) {
    // JavascriptInterface方式但是Native无法提供_cordovaNative对象的时候强制切到prompt()
    if (mode == jsToNativeModes.JS_OBJECT && !window._cordovaNative) {
        mode = jsToNativeModes.PROMPT;
    }
    nativeApiProvider.setPreferPrompt(mode == jsToNativeModes.PROMPT);
    jsToNativeBridgeMode = mode;
};

// 设置Native->JS的交互方式
androidExec.setNativeToJsBridgeMode = function(mode) {
    if (mode == nativeToJsBridgeMode) {
        return;
    }
    // 如果以前是Poll的方式，先回置到非Poll
    if (nativeToJsBridgeMode == nativeToJsModes.POLLING) {
        pollEnabled = false;
    }

    nativeToJsBridgeMode = mode;
    // Tell the native side to switch modes.
    // Otherwise, it will be set by androidExec.init()
    // 告诉Native端，JS端获取消息的方式
    if (bridgeSecret >= 0) {
        nativeApiProvider.get().setNativeToJsBridgeMode(bridgeSecret, mode);
    }

    // 如果是在JS端Poll的方式的话
    if (mode == nativeToJsModes.POLLING) {
        pollEnabled = true;
        // 停顿后执行exec获取消息message
        setTimeout(pollingTimerFunc, 1);
    }
};

function buildPayload(payload, message) {
    var payloadKind = message.charAt(0);
    if (payloadKind == 's') {
        // 字符串：s+字符串
        payload.push(message.slice(1));
    } else if (payloadKind == 't') {
        // 布尔值：t/f
        payload.push(true);
    } else if (payloadKind == 'f') {
        // 布尔值：t/f
        payload.push(false);
    } else if (payloadKind == 'N') {
        // Null: N
        payload.push(null);
    } else if (payloadKind == 'n') {
        // 数值: n+具体值
        payload.push(+message.slice(1));
    } else if (payloadKind == 'A') {
        // ArrayBuffer： A+数据
        var data = message.slice(1);
        payload.push(base64.toArrayBuffer(data));
    } else if (payloadKind == 'S') {
        // 二进制字符串：S+字符串
        payload.push(window.atob(message.slice(1)));
    } else if (payloadKind == 'M') {
        // 返回消息包含多个，截断继续解析
        var multipartMessages = message.slice(1);
        while (multipartMessages !== "") {
            var spaceIdx = multipartMessages.indexOf(' ');
            var msgLen = +multipartMessages.slice(0, spaceIdx);
            var multipartMessage = multipartMessages.substr(spaceIdx + 1, msgLen);
            multipartMessages = multipartMessages.slice(spaceIdx + msgLen + 1);
            buildPayload(payload, multipartMessage);
        }
    } else {
        // JSON: JSON串
        payload.push(JSON.parse(message));
    }
}

// 处理从Native返回的一条消息
//
// 回传消息的完整格式：
// （1）消息的长度+空格+J+JavaScript代码
// 44 Jcordova.callbackFromNative('InAppBrowser1478332075',true,1,[{"type":"loadstop","url":"http:\/\/www.baidu.com\/"}],true);
// （2）消息的长度+空格+成功失败标记（J/S/F）+keepCallback标示+具体的状态码+空格+回调ID+空格+回传数据
// 78 S11 InAppBrowser970748887 {"type":"loadstop","url":"http:\/\/www.baidu.com\/"}
// 28 S01 Notification970748887 n0
//
// Processes a single message, as encoded by NativeToJsMessageQueue.java.
function processMessage(message) {
    var firstChar = message.charAt(0);
    if (firstChar == 'J') {
        // This is deprecated on the .java side. It doesn't work with CSP enabled.
        // 执行回传的JavaScript代码
        eval(message.slice(1));
    } else if (firstChar == 'S' || firstChar == 'F') {
        // S代表处理成功（包含没有数据），F代表处理失败
        var success = firstChar == 'S';
        var keepCallback = message.charAt(1) == '1';
        var spaceIdx = message.indexOf(' ', 2);
        var status = +message.slice(2, spaceIdx);
        var nextSpaceIdx = message.indexOf(' ', spaceIdx + 1);
        var callbackId = message.slice(spaceIdx + 1, nextSpaceIdx);
        var payloadMessage = message.slice(nextSpaceIdx + 1);
        var payload = [];
        buildPayload(payload, payloadMessage);
        // 调用回调函数
        cordova.callbackFromNative(callbackId, success, status, payload, keepCallback);
    } else {
        console.log("processMessage failed: invalid message: " + JSON.stringify(message));
    }
}

// 处理Native返回的消息
function processMessages() {
    // Check for the reentrant case.
    if (isProcessing) {
        return;
    }
    if (messagesFromNative.length === 0) {
        return;
    }
    isProcessing = true;
    try {
        var msg = popMessageFromQueue();
        // The Java side can send a * message to indicate that it
        // still has messages waiting to be retrieved.
        // Native返回*代表消息需要等一会儿再取
        if (msg == '*' && messagesFromNative.length === 0) {
            // 再次去获取消息
            nextTick(pollOnce);
            return;
        }
        processMessage(msg);
    } finally {
        isProcessing = false;
        if (messagesFromNative.length > 0) {
            nextTick(processMessages);
        }
    }
}

function popMessageFromQueue() {
    var messageBatch = messagesFromNative.shift();
    if (messageBatch == '*') {
        return '*';
    }

    // 获取消息的长度
    var spaceIdx = messageBatch.indexOf(' ');
    var msgLen = +messageBatch.slice(0, spaceIdx);
    // 获取第一个消息
    var message = messageBatch.substr(spaceIdx + 1, msgLen);
    // 截取调第一个消息
    messageBatch = messageBatch.slice(spaceIdx + msgLen + 1);
    if (messageBatch) {
        messagesFromNative.unshift(messageBatch);
    }
    return message;
}

module.exports = androidExec;

});

// file: src/common/exec/proxy.js
define("cordova/exec/proxy", function(require, exports, module) {

// internal map of proxy function
// 用于Plugin中往已经有的模块上添加方法
var CommandProxyMap = {};

module.exports = {

    // example: cordova.commandProxy.add("Accelerometer",{getCurrentAcceleration: function(successCallback, errorCallback, options) {...},...);
    add: function (id, proxyObj) {
        console.log('adding proxy for ' + id);
        CommandProxyMap[id] = proxyObj;
        return proxyObj;
    },

    // cordova.commandProxy.remove("Accelerometer");
    remove: function (id) {
        var proxy = CommandProxyMap[id];
        delete CommandProxyMap[id];
        CommandProxyMap[id] = null;
        return proxy;
    },

    get: function (service, action) {
        return (CommandProxyMap[service] ? CommandProxyMap[service][action] : null);
    }
};

});

// file: src/common/init.js
define("cordova/init", function(require, exports, module) {

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

});

// file: src/common/modulemapper.js
define("cordova/modulemapper", function(require, exports, module) {

// 把定义的模块clobber到一个对象，在初期化的时候回赋给window
var builder = require('cordova/builder');
var moduleMap = define.moduleMap; // eslint-disable-line no-undef
var symbolList;
var deprecationMap;

exports.reset = function () {
    symbolList = [];
    deprecationMap = {};
};

function addEntry (strategy, moduleName, symbolPath, opt_deprecationMessage) {
    if (!(moduleName in moduleMap)) {
        throw new Error('Module ' + moduleName + ' does not exist.');
    }
    symbolList.push(strategy, moduleName, symbolPath);
    if (opt_deprecationMessage) {
        deprecationMap[symbolPath] = opt_deprecationMessage;
    }
}

// Note: Android 2.3 does have Function.bind().
exports.clobbers = function (moduleName, symbolPath, opt_deprecationMessage) {
    addEntry('c', moduleName, symbolPath, opt_deprecationMessage);
};

exports.merges = function (moduleName, symbolPath, opt_deprecationMessage) {
    addEntry('m', moduleName, symbolPath, opt_deprecationMessage);
};

exports.defaults = function (moduleName, symbolPath, opt_deprecationMessage) {
    addEntry('d', moduleName, symbolPath, opt_deprecationMessage);
};

exports.runs = function (moduleName) {
    addEntry('r', moduleName, null);
};

function prepareNamespace (symbolPath, context) {
    if (!symbolPath) {
        return context;
    }
    var parts = symbolPath.split('.');
    var cur = context;
    for (var i = 0, part; part = parts[i]; ++i) { // eslint-disable-line no-cond-assign
        cur = cur[part] = cur[part] || {};
    }
    return cur;
}

exports.mapModules = function (context) {
    var origSymbols = {};
    context.CDV_origSymbols = origSymbols;
    for (var i = 0, len = symbolList.length; i < len; i += 3) {
        var strategy = symbolList[i];
        var moduleName = symbolList[i + 1];
        var module = require(moduleName);
        // <runs/>
        if (strategy === 'r') {
            continue;
        }
        var symbolPath = symbolList[i + 2];
        var lastDot = symbolPath.lastIndexOf('.');
        var namespace = symbolPath.substr(0, lastDot);
        var lastName = symbolPath.substr(lastDot + 1);

        var deprecationMsg = symbolPath in deprecationMap ? 'Access made to deprecated symbol: ' + symbolPath + '. ' + deprecationMsg : null;
        var parentObj = prepareNamespace(namespace, context);
        var target = parentObj[lastName];

        if (strategy === 'm' && target) {
            builder.recursiveMerge(target, module);
        } else if ((strategy === 'd' && !target) || (strategy !== 'd')) {
            if (!(symbolPath in origSymbols)) {
                origSymbols[symbolPath] = target;
            }
            builder.assignOrWrapInDeprecateGetter(parentObj, lastName, module, deprecationMsg);
        }
    }
};

exports.getOriginalSymbol = function (context, symbolPath) {
    var origSymbols = context.CDV_origSymbols;
    if (origSymbols && (symbolPath in origSymbols)) {
        return origSymbols[symbolPath];
    }
    var parts = symbolPath.split('.');
    var obj = context;
    for (var i = 0; i < parts.length; ++i) {
        obj = obj && obj[parts[i]];
    }
    return obj;
};

exports.reset();

});

// file: /Users/admin/repo/vuerepo/cordova-android/cordova-js-src/platform.js
define("cordova/platform", function(require, exports, module) {

// The last resume event that was received that had the result of a plugin call.
// bootstrap处理
var lastResumeEvent = null;

module.exports = {
    id: 'android',
    // 平台启动处理（各个平台处理都不一样，比如ios就只需要触发onNativeReady）
    bootstrap: function() {
        var channel = require('cordova/channel'),
            cordova = require('cordova'),
            exec = require('cordova/exec'),
            modulemapper = require('cordova/modulemapper');

        // Get the shared secret needed to use the bridge.
        exec.init();

        // TODO: Extract this as a proper plugin.
        // app插件
        modulemapper.clobbers('cordova/plugin/android/app', 'navigator.app');

        var APP_PLUGIN_NAME = Number(cordova.platformVersion.split('.')[0]) >= 4 ? 'CoreAndroid' : 'App';

        // Inject a listener for the backbutton on the document.
        // 给返回按钮注册监听器
        var backButtonChannel = cordova.addDocumentEventHandler('backbutton');
        backButtonChannel.onHasSubscribersChange = function() {
            // If we just attached the first handler or detached the last handler,
            // let native know we need to override the back button.
            // 如果只为返回按钮定义了1个事件监听器的话，通知后台覆盖默认行为
            exec(null, null, APP_PLUGIN_NAME, "overrideBackbutton", [this.numHandlers == 1]);
        };

        // Add hardware MENU and SEARCH button handlers
        // 添加菜单和搜索的事件监听
        cordova.addDocumentEventHandler('menubutton');
        cordova.addDocumentEventHandler('searchbutton');

        function bindButtonChannel(buttonName) {
            // generic button bind used for volumeup/volumedown buttons
            var volumeButtonChannel = cordova.addDocumentEventHandler(buttonName + 'button');
            volumeButtonChannel.onHasSubscribersChange = function() {
                exec(null, null, APP_PLUGIN_NAME, "overrideButton", [buttonName, this.numHandlers == 1]);
            };
        }
        // Inject a listener for the volume buttons on the document.
        bindButtonChannel('volumeup');
        bindButtonChannel('volumedown');

        // The resume event is not "sticky", but it is possible that the event
        // will contain the result of a plugin call. We need to ensure that the
        // plugin result is delivered even after the event is fired (CB-10498)
        var cordovaAddEventListener = document.addEventListener;

        document.addEventListener = function(evt, handler, capture) {
            cordovaAddEventListener(evt, handler, capture);

            if (evt === 'resume' && lastResumeEvent) {
                handler(lastResumeEvent);
            }
        };

        // Let native code know we are all done on the JS side.
        // Native code will then un-hide the WebView.
        // 启动完成后，告诉本地代码显示WebView
        channel.onCordovaReady.subscribe(function() {
            exec(onMessageFromNative, null, APP_PLUGIN_NAME, 'messageChannel', []);
            exec(null, null, APP_PLUGIN_NAME, "show", []);
        });
    }
};

function onMessageFromNative(msg) {
    var cordova = require('cordova');
    var action = msg.action;

    switch (action)
    {
        // Button events
        case 'backbutton':
        case 'menubutton':
        case 'searchbutton':
        // App life cycle events
        case 'pause':
        // Volume events
        case 'volumedownbutton':
        case 'volumeupbutton':
            cordova.fireDocumentEvent(action);
            break;
        case 'resume':
            if(arguments.length > 1 && msg.pendingResult) {
                if(arguments.length === 2) {
                    msg.pendingResult.result = arguments[1];
                } else {
                    // The plugin returned a multipart message
                    var res = [];
                    for(var i = 1; i < arguments.length; i++) {
                        res.push(arguments[i]);
                    }
                    msg.pendingResult.result = res;
                }

                // Save the plugin result so that it can be delivered to the js
                // even if they miss the initial firing of the event
                lastResumeEvent = msg;
            }
            cordova.fireDocumentEvent(action, msg);
            break;
        default:
            throw new Error('Unknown event action ' + action);
    }
}

});

// file: /Users/admin/repo/vuerepo/cordova-android/cordova-js-src/plugin/android/app.js
define("cordova/plugin/android/app", function(require, exports, module) {

// 清缓存、loadUrl、退出程序等
var exec = require('cordova/exec');
var APP_PLUGIN_NAME = Number(require('cordova').platformVersion.split('.')[0]) >= 4 ? 'CoreAndroid' : 'App';

module.exports = {
    /**
    * Clear the resource cache.
    */
    clearCache:function() {
        exec(null, null, APP_PLUGIN_NAME, "clearCache", []);
    },

    /**
    * Load the url into the webview or into new browser instance.
    *
    * @param url           The URL to load
    * @param props         Properties that can be passed in to the activity:
    *      wait: int                           => wait msec before loading URL
    *      loadingDialog: "Title,Message"      => display a native loading dialog
    *      loadUrlTimeoutValue: int            => time in msec to wait before triggering a timeout error
    *      clearHistory: boolean              => clear webview history (default=false)
    *      openExternal: boolean              => open in a new browser (default=false)
    *
    * Example:
    *      navigator.app.loadUrl("http://server/myapp/index.html", {wait:2000, loadingDialog:"Wait,Loading App", loadUrlTimeoutValue: 60000});
    */
    loadUrl:function(url, props) {
        exec(null, null, APP_PLUGIN_NAME, "loadUrl", [url, props]);
    },

    /**
    * Cancel loadUrl that is waiting to be loaded.
    */
    cancelLoadUrl:function() {
        exec(null, null, APP_PLUGIN_NAME, "cancelLoadUrl", []);
    },

    /**
    * Clear web history in this web view.
    * Instead of BACK button loading the previous web page, it will exit the app.
    */
    clearHistory:function() {
        exec(null, null, APP_PLUGIN_NAME, "clearHistory", []);
    },

    /**
    * Go to previous page displayed.
    * This is the same as pressing the backbutton on Android device.
    */
    backHistory:function() {
        exec(null, null, APP_PLUGIN_NAME, "backHistory", []);
    },

    /**
    * Override the default behavior of the Android back button.
    * If overridden, when the back button is pressed, the "backKeyDown" JavaScript event will be fired.
    *
    * Note: The user should not have to call this method.  Instead, when the user
    *       registers for the "backbutton" event, this is automatically done.
    *
    * @param override        T=override, F=cancel override
    */
    overrideBackbutton:function(override) {
        exec(null, null, APP_PLUGIN_NAME, "overrideBackbutton", [override]);
    },

    /**
    * Override the default behavior of the Android volume button.
    * If overridden, when the volume button is pressed, the "volume[up|down]button"
    * JavaScript event will be fired.
    *
    * Note: The user should not have to call this method.  Instead, when the user
    *       registers for the "volume[up|down]button" event, this is automatically done.
    *
    * @param button          volumeup, volumedown
    * @param override        T=override, F=cancel override
    */
    overrideButton:function(button, override) {
        exec(null, null, APP_PLUGIN_NAME, "overrideButton", [button, override]);
    },

    /**
    * Exit and terminate the application.
    */
    exitApp:function() {
        return exec(null, null, APP_PLUGIN_NAME, "exitApp", []);
    }
};

});

// file: src/common/pluginloader.js
define("cordova/pluginloader", function(require, exports, module) {

// 加载所有cordova_plugin.js中定义的模块，执行完成后会触发onPluginsReady
// cordova_plugins.js中命名了一个cordova/plugin_list模块，在load时，会动态加载到head里
var modulemapper = require('cordova/modulemapper');

// Helper function to inject a <script> tag.
// Exported for testing.
// 创建<script>tag，把js文件动态添加到head中
exports.injectScript = function (url, onload, onerror) {
    var script = document.createElement('script');
    // onload fires even when script fails loads with an error.
    script.onload = onload;
    // onerror fires for malformed URLs.
    script.onerror = onerror;
    script.src = url;
    document.head.appendChild(script);
};

function injectIfNecessary (id, url, onload, onerror) {
    onerror = onerror || onload;
    if (id in define.moduleMap) { // eslint-disable-line no-undef
        onload();
    } else {
        exports.injectScript(url, function () {
            if (id in define.moduleMap) { // eslint-disable-line no-undef
                onload();
            } else {
                onerror();
            }
        }, onerror);
    }
}

// 加载到head中的插件js脚本定义如下：
// cordova.define("org.apache.cordova.xxx", function(require, exports, module) {...});
// 模块名称是cordova_plugins.js中定义的id，所以要把该id指向定义好的clobbers
function onScriptLoadingComplete (moduleList, finishPluginLoading) {
    // Loop through all the plugins and then through their clobbers and merges.
    for (var i = 0, module; module = moduleList[i]; i++) { // eslint-disable-line no-cond-assign
        // 把该模块需要clobber的clobber到指定的clobbers里
        if (module.clobbers && module.clobbers.length) {
            for (var j = 0; j < module.clobbers.length; j++) {
                modulemapper.clobbers(module.id, module.clobbers[j]);
            }
        }
        // 把该模块需要合并的部分合并到指定的模块里
        if (module.merges && module.merges.length) {
            for (var k = 0; k < module.merges.length; k++) {
                modulemapper.merges(module.id, module.merges[k]);
            }
        }

        // Finally, if runs is truthy we want to simply require() the module.
        // 处理只希望require()的模块
        // <js-module src="www/xxx.js" name="Xxx">
        //  <runs />
        // </js-module>
        if (module.runs) {
            modulemapper.runs(module.id);
        }
    }

    finishPluginLoading();
}

// Handler for the cordova_plugins.js content.
// See plugman's plugin_loader.js for the details of this object.
// This function is only called if the really is a plugins array that isn't empty.
// Otherwise the onerror response handler will just call finishPluginLoading().
// 加载所有cordova_plugins.js中定义的js-module
function handlePluginsObject (path, moduleList, finishPluginLoading) {
    // Now inject the scripts.
    var scriptCounter = moduleList.length;

    // 没有插件，直接执行回调后返回
    if (!scriptCounter) {
        finishPluginLoading();
        return;
    }
    // 加载每个插件js的脚本的回调
    function scriptLoadedCallback () {
        // 加载完成一个就把计数器减1
        if (!--scriptCounter) {
            // 直到所有插件的js脚本都被加载完成后clobber
            onScriptLoadingComplete(moduleList, finishPluginLoading);
        }
    }

    // 依次把插件的js脚本添加到head中后加载
    for (var i = 0; i < moduleList.length; i++) {
        injectIfNecessary(moduleList[i].id, path + moduleList[i].file, scriptLoadedCallback);
    }
}

// 获取cordova.js文件的路径
function findCordovaPath () {
    var path = null;
    var scripts = document.getElementsByTagName('script');
    var term = '/cordova.js';
    for (var n = scripts.length - 1; n > -1; n--) {
        var src = scripts[n].src.replace(/\?.*$/, ''); // Strip any query param (CB-6007).
        if (src.indexOf(term) === (src.length - term.length)) {
            path = src.substring(0, src.length - term.length) + '/';
            break;
        }
    }
    return path;
}

// Tries to load all plugins' js-modules.
// This is an async process, but onDeviceReady is blocked on onPluginsReady.
// onPluginsReady is fired when there are no plugins to load, or they are all done.
// 加载所有cordova_plugins.js中定义的js-module
// 执行完成后会触发onPluginsReady(异步执行)
exports.load = function (callback) {
    // 取cordova.js文件所在的路径
    var pathPrefix = findCordovaPath();
    if (pathPrefix === null) {
        console.log('Could not find cordova.js script tag. Plugin loading may fail.');
        pathPrefix = '';
    }
    // 注入插件的js脚本
    injectIfNecessary('cordova/plugin_list', pathPrefix + 'cordova_plugins.js', function () {
        var moduleList = require('cordova/plugin_list');
        handlePluginsObject(pathPrefix, moduleList, callback);
    }, callback);
};

});

// file: src/common/urlutil.js
define("cordova/urlutil", function(require, exports, module) {

// 获取绝对URL，InAppBrowser中会用到

/**
 * For already absolute URLs, returns what is passed in.
 * For relative URLs, converts them to absolute ones.
 */
exports.makeAbsolute = function makeAbsolute (url) {
    var anchorEl = document.createElement('a');
    anchorEl.href = url;
    return anchorEl.href;
};

});

// file: src/common/utils.js
define("cordova/utils", function(require, exports, module) {

// 工具类
var utils = exports;

/**
 * Defines a property getter / setter for obj[key].
 */
utils.defineGetterSetter = function (obj, key, getFunc, opt_setFunc) {
    if (Object.defineProperty) {
        var desc = {
            get: getFunc,
            configurable: true
        };
        if (opt_setFunc) {
            desc.set = opt_setFunc;
        }
        Object.defineProperty(obj, key, desc);
    } else {
        obj.__defineGetter__(key, getFunc);
        if (opt_setFunc) {
            obj.__defineSetter__(key, opt_setFunc);
        }
    }
};

/**
 * Defines a property getter for obj[key].
 */
utils.defineGetter = utils.defineGetterSetter;

utils.arrayIndexOf = function (a, item) {
    if (a.indexOf) {
        return a.indexOf(item);
    }
    var len = a.length;
    for (var i = 0; i < len; ++i) {
        if (a[i] === item) {
            return i;
        }
    }
    return -1;
};

/**
 * Returns whether the item was found in the array.
 */
utils.arrayRemove = function (a, item) {
    var index = utils.arrayIndexOf(a, item);
    if (index !== -1) {
        a.splice(index, 1);
    }
    return index !== -1;
};

utils.typeName = function (val) {
    return Object.prototype.toString.call(val).slice(8, -1);
};

/**
 * Returns an indication of whether the argument is an array or not
 */
utils.isArray = Array.isArray ||
                function (a) { return utils.typeName(a) === 'Array'; };

/**
 * Returns an indication of whether the argument is a Date or not
 */
utils.isDate = function (d) {
    return (d instanceof Date);
};

/**
 * Does a deep clone of the object.
 */
utils.clone = function (obj) {
    if (!obj || typeof obj === 'function' || utils.isDate(obj) || typeof obj !== 'object') {
        return obj;
    }

    var retVal, i;

    if (utils.isArray(obj)) {
        retVal = [];
        for (i = 0; i < obj.length; ++i) {
            retVal.push(utils.clone(obj[i]));
        }
        return retVal;
    }

    retVal = {};
    for (i in obj) {
        // https://issues.apache.org/jira/browse/CB-11522 'unknown' type may be returned in
        // custom protocol activation case on Windows Phone 8.1 causing "No such interface supported" exception
        // on cloning.
        if ((!(i in retVal) || retVal[i] !== obj[i]) && typeof obj[i] !== 'undefined' && typeof obj[i] !== 'unknown') { // eslint-disable-line valid-typeof
            retVal[i] = utils.clone(obj[i]);
        }
    }
    return retVal;
};

/**
 * Returns a wrapped version of the function
 */
utils.close = function (context, func, params) {
    return function () {
        var args = params || arguments;
        return func.apply(context, args);
    };
};

// ------------------------------------------------------------------------------
function UUIDcreatePart (length) {
    var uuidpart = '';
    for (var i = 0; i < length; i++) {
        var uuidchar = parseInt((Math.random() * 256), 10).toString(16);
        if (uuidchar.length === 1) {
            uuidchar = '0' + uuidchar;
        }
        uuidpart += uuidchar;
    }
    return uuidpart;
}

/**
 * Create a UUID
 */
utils.createUUID = function () {
    return UUIDcreatePart(4) + '-' +
        UUIDcreatePart(2) + '-' +
        UUIDcreatePart(2) + '-' +
        UUIDcreatePart(2) + '-' +
        UUIDcreatePart(6);
};

/**
 * Extends a child object from a parent object using classical inheritance
 * pattern.
 */
utils.extend = (function () {
    // proxy used to establish prototype chain
    var F = function () {};
    // extend Child from Parent
    return function (Child, Parent) {

        F.prototype = Parent.prototype;
        Child.prototype = new F();
        Child.__super__ = Parent.prototype;
        Child.prototype.constructor = Child;
    };
}());

/**
 * Alerts a message in any available way: alert or console.log.
 */
utils.alert = function (msg) {
    if (window.alert) {
        window.alert(msg);
    } else if (console && console.log) {
        console.log(msg);
    }
};

});

window.cordova = require('cordova');
// file: src/scripts/bootstrap.js

// 启动处理(只调用了初期处理require('cordova/init';)，注意和platform的bootstrap处理不一样)
require('cordova/init');

})();