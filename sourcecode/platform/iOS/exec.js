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

/*global require, module, atob, document */

/**
 * Creates a gap bridge iframe used to notify the native code about queued
 * commands.
 */
var cordova = require('cordova'),
    utils = require('cordova/utils'),
    base64 = require('cordova/base64'),
    execIframe,
    commandQueue = [], // Contains pending JS->Native messages.
    isInContextOfEvalJs = 0,
    failSafeTimerId = 0;

// 把所有参数转换成iOS的原生方式
function massageArgsJsToNative(args) {
    if (!args || utils.typeName(args) != 'Array') {
        return args;
    }
    var ret = [];
    args.forEach(function(arg, i) {
        if (utils.typeName(arg) == 'ArrayBuffer') {
            ret.push({
                'CDVType': 'ArrayBuffer',
                'data': base64.fromArrayBuffer(arg)
            });
        } else {
            ret.push(arg);
        }
    });
    return ret;
}

function massageMessageNativeToJs(message) {
    if (message.CDVType == 'ArrayBuffer') {
        var stringToArrayBuffer = function(str) {
            var ret = new Uint8Array(str.length);
            for (var i = 0; i < str.length; i++) {
                ret[i] = str.charCodeAt(i);
            }
            return ret.buffer;
        };
        var base64ToArrayBuffer = function(b64) {
            return stringToArrayBuffer(atob(b64));
        };
        message = base64ToArrayBuffer(message.data);
    }
    return message;
}

function convertMessageToArgsNativeToJs(message) {
    var args = [];
    if (!message || !message.hasOwnProperty('CDVType')) {
        args.push(message);
    } else if (message.CDVType == 'MultiPart') {
        message.messages.forEach(function(e) {
            args.push(massageMessageNativeToJs(e));
        });
    } else {
        args.push(massageMessageNativeToJs(message));
    }
    return args;
}

// 执行Cordova提供的API
// 比如: exec(successCallback, errorCallback, "Camera", "takePicture", args);
function iOSExec() {

    var successCallback, failCallback, service, action, actionArgs;
    var callbackId = null;
    if (typeof arguments[0] !== 'string') {
        // FORMAT ONE
        // 成功的回调
        successCallback = arguments[0];
        // 失败回调
        failCallback = arguments[1];
        // 所调用native plugin类
        service = arguments[2];
        // 所调用native plugin的类下的具体method
        action = arguments[3];
        // 具体参数
        actionArgs = arguments[4];

        // Since we need to maintain backwards compatibility, we have to pass
        // an invalid callbackId even if no callback was provided since plugins
        // will be expecting it. The Cordova.exec() implementation allocates
        // an invalid callbackId and passes it even if no callbacks were given.
        callbackId = 'INVALID';
    } else {
        throw new Error('The old format of this exec call has been removed (deprecated since 2.1). Change to: ' +
            'cordova.exec(null, null, \'Service\', \'action\', [ arg1, arg2 ]);'
        );
    }

    // If actionArgs is not provided, default to an empty array
    actionArgs = actionArgs || [];

    // Register the callbacks and add the callbackId to the positional
    // arguments if given.
    if (successCallback || failCallback) {
        callbackId = service + cordova.callbackId++;
        cordova.callbacks[callbackId] =
            {success:successCallback, fail:failCallback};
    }

    actionArgs = massageArgsJsToNative(actionArgs);

    var command = [callbackId, service, action, actionArgs];

    // Stringify and queue the command. We stringify to command now to
    // effectively clone the command arguments in case they are mutated before
    // the command is executed.
    commandQueue.push(JSON.stringify(command));

    // If we're in the context of a stringByEvaluatingJavaScriptFromString call,
    // then the queue will be flushed when it returns; no need for a poke.
    // Also, if there is already a command in the queue, then we've already
    // poked the native side, so there is no reason to do so again.
    if (!isInContextOfEvalJs && commandQueue.length == 1) {
        pokeNative();
    }
}

// CB-10530
function proxyChanged() {
    var cexec = cordovaExec();
       
    return (execProxy !== cexec && // proxy objects are different
            iOSExec !== cexec      // proxy object is not the current iOSExec
            );
}

// CB-10106
function handleBridgeChange() {
    if (proxyChanged()) {
        var commandString = commandQueue.shift();
        while(commandString) {
            var command = JSON.parse(commandString);
            var callbackId = command[0];
            var service = command[1];
            var action = command[2];
            var actionArgs = command[3];
            var callbacks = cordova.callbacks[callbackId] || {};
            
            execProxy(callbacks.success, callbacks.fail, service, action, actionArgs);
            
            commandString = commandQueue.shift();
        };
        return true;
    }
    
    return false;
}

/**
 * pokeNative实现JS如何通知native，调用native的方法
 * 通过UIWebView相关的UIWebViewDelegate协议的拦截url(IOS7之后引入原生的JavascriptCore之后有别的实现方式)
 * 对js端发来的request作出响应
 * cordova使用的方法是创建一个iframe并且设置iframe的src的方式来进行url的改变，之后所有的请求会根据是否存在这个iframe来通过改变location的方式发起请求，避免前端的异步请求会创建多个iframe
*/
function pokeNative() {
    // CB-5488 - Don't attempt to create iframe before document.body is available.
    if (!document.body) {
        setTimeout(pokeNative);
        return;
    }
    
    // Check if they've removed it from the DOM, and put it back if so.
    if (execIframe && execIframe.contentWindow) {
        execIframe.contentWindow.location = 'gap://ready';
    } else {
        execIframe = document.createElement('iframe');
        execIframe.style.display = 'none';
        execIframe.src = 'gap://ready';
        document.body.appendChild(execIframe);
    }
    // Use a timer to protect against iframe being unloaded during the poke (CB-7735).
    // This makes the bridge ~ 7% slower, but works around the poke getting lost
    // when the iframe is removed from the DOM.
    // An onunload listener could be used in the case where the iframe has just been
    // created, but since unload events fire only once, it doesn't work in the normal
    // case of iframe reuse (where unload will have already fired due to the attempted
    // navigation of the page).
    failSafeTimerId = setTimeout(function() {
        if (commandQueue.length) {
            // CB-10106 - flush the queue on bridge change
            if (!handleBridgeChange()) {
                pokeNative();
             }
        }
    }, 50); // Making this > 0 improves performance (marginally) in the normal case (where it doesn't fire).
}

/**
 * 该方法由原生调起，发生在原生拦截"gap://ready"之后
 * 实现原理：
 *  js通知native的所有入口，所有的js调用native都需要经过重载uiwebView中的UIWebViewDelegate协议中的shouldStartLoadWithRequest
 *  该类原生路径为./CordovaLib/Classes/Private/Plugins/CDVUIWebViewEngine/CDVUIWebViewNavigationDelegate.m
 *  - (BOOL)webView:(UIWebView*)theWebView shouldStartLoadWithRequest:(NSURLRequest*)request navigationType:(UIWebViewNavigationType)navigationType
 *   {
 *   NSURL* url = [request URL];
 *   CDVViewController* vc = (CDVViewController*)self.enginePlugin.viewController;
 *
 *   if ([[url scheme] isEqualToString:@"gap"]) {
 *       [vc.commandQueue fetchCommandsFromJs];
 *       // The delegate is called asynchronously in this case, so we don't have to use
 *       // flushCommandQueueWithDelayedJs (setTimeout(0)) as we do with hash changes.
 *       [vc.commandQueue executePending];
 *       return NO;
 *   }
 *  对所有以gap为开头的uri拦截，都会执行CDVViewContoller中的commandQueue
 *  该类原生路径为./CordovaLib/Classes/Public/CDVCommandQueue.m
 *  - (void)fetchCommandsFromJs
 *   {
 *       __weak CDVCommandQueue* weakSelf = self;
 *       NSString* js = @"cordova.require('cordova/exec').nativeFetchMessages()";
 *
 *       [_viewController.webViewEngine evaluateJavaScript:js
 *                                       completionHandler:^(id obj, NSError* error) {
 *           if ((error == nil) && [obj isKindOfClass:[NSString class]]) {
 *               NSString* queuedCommandsJSON = (NSString*)obj;
 *               CDV_EXEC_LOG(@"Exec: Flushed JS->native queue (hadCommands=%d).", [queuedCommandsJSON length] > 0);
 *               [weakSelf enqueueCommandBatch:queuedCommandsJSON];
 *               // this has to be called here now, because fetchCommandsFromJs is now async (previously: synchronous)
 *               [self executePending];
 *           }
 *       }];
 *   }
 *  找到对应的类和方法执行完成后，调用nativeCallback回传到JS
 */
iOSExec.nativeFetchMessages = function() {
    // Stop listing for window detatch once native side confirms poke.
    if (failSafeTimerId) {
        clearTimeout(failSafeTimerId);
        failSafeTimerId = 0;
    }
    // Each entry in commandQueue is a JSON string already.
    if (!commandQueue.length) {
        return '';
    }
    var json = '[' + commandQueue.join(',') + ']';
    commandQueue.length = 0;
    return json;
};

/**
 * native处理完动作之后的触发回调统一入口为该函数，且是以同步的方式来触发native->js的callback
 * 原生代码路径 ./CordovaLib/Classes/Public/CDVCommandDelegateImpl.m
 * - (void)sendPluginResult:(CDVPluginResult*)result callbackId:(NSString*)callbackId
 *   {
 *       CDV_EXEC_LOG(@"Exec(%@): Sending result. Status=%@", callbackId, result.status);
 *       // This occurs when there is are no win/fail callbacks for the call.
 *       if ([@"INVALID" isEqualToString:callbackId]) {
 *           return;
 *       }
 *       // This occurs when the callback id is malformed.
 *       if (![self isValidCallbackId:callbackId]) {
 *           NSLog(@"Invalid callback id received by sendPluginResult");
 *           return;
 *       }
 *       int status = [result.status intValue];
 *       BOOL keepCallback = [result.keepCallback boolValue];
 *       NSString* argumentsAsJSON = [result argumentsAsJSON];
 *       BOOL debug = NO;
 *       
 *   #ifdef DEBUG
 *       debug = YES;
 *   #endif
 *
 *       NSString* js = [NSString stringWithFormat:@"cordova.require('cordova/exec').nativeCallback('%@',%d,%@,%d, %d)", callbackId, status, argumentsAsJSON, keepCallback, debug];
 *
 *       [self evalJsHelper:js];
 *   }
 */
iOSExec.nativeCallback = function(callbackId, status, message, keepCallback, debug) {
    return iOSExec.nativeEvalAndFetch(function() {
        var success = status === 0 || status === 1;
        var args = convertMessageToArgsNativeToJs(message);
        function nc2() {
            cordova.callbackFromNative(callbackId, success, status, args, keepCallback);
        }
        setTimeout(nc2, 0);
    });
};

iOSExec.nativeEvalAndFetch = function(func) {
    // This shouldn't be nested, but better to be safe.
    isInContextOfEvalJs++;
    try {
        func();
        return iOSExec.nativeFetchMessages();
    } finally {
        isInContextOfEvalJs--;
    }
};

// Proxy the exec for bridge changes. See CB-10106

function cordovaExec() {
    var cexec = require('cordova/exec');
    var cexec_valid = (typeof cexec.nativeFetchMessages === 'function') && (typeof cexec.nativeEvalAndFetch === 'function') && (typeof cexec.nativeCallback === 'function');
    return (cexec_valid && execProxy !== cexec)? cexec : iOSExec;
}

function execProxy() {
    cordovaExec().apply(null, arguments);
};

execProxy.nativeFetchMessages = function() {
    return cordovaExec().nativeFetchMessages.apply(null, arguments);
};

execProxy.nativeEvalAndFetch = function() {
    return cordovaExec().nativeEvalAndFetch.apply(null, arguments);
};

execProxy.nativeCallback = function() {
    return cordovaExec().nativeCallback.apply(null, arguments);
};

module.exports = execProxy;
