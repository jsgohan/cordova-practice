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
